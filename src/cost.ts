import { CostExplorerClient, GetCostAndUsageCommand, ResultByTime } from '@aws-sdk/client-cost-explorer';
import dayjs, { Dayjs } from 'dayjs';
import { AWSConfig } from './config';
import { showSpinner } from './logger';

export type RawCostByService = {
  [key: string]: {
    [date: string]: number;
  };
};

/**
 * Fetches daily cost per service between start (inclusive) and end (exclusive).
 * Follows NextPageToken, since long date ranges come back in several pages.
 */
export async function getDailyCostByService(
  awsConfig: AWSConfig,
  startDate: Dayjs,
  endDate: Dayjs
): Promise<RawCostByService> {
  const costExplorer = new CostExplorerClient(awsConfig);

  const results: ResultByTime[] = [];
  let nextPageToken: string | undefined;

  do {
    const page = await costExplorer.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startDate.format('YYYY-MM-DD'),
          End: endDate.format('YYYY-MM-DD'),
        },
        Granularity: 'DAILY',
        Filter: {
          Not: {
            Dimensions: {
              Key: 'RECORD_TYPE',
              Values: ['Credit', 'Refund', 'Upfront', 'Support'],
            },
          },
        },
        Metrics: ['UnblendedCost'],
        GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
        NextPageToken: nextPageToken,
      })
    );

    results.push(...(page.ResultsByTime || []));
    nextPageToken = page.NextPageToken;
  } while (nextPageToken);

  const costByService: RawCostByService = {};

  for (const day of results) {
    // The cost belongs to the day the period starts on (End is exclusive)
    const costDate = day.TimePeriod.Start;

    for (const group of day.Groups || []) {
      const serviceName = group.Keys[0];
      const cost = parseFloat(group.Metrics.UnblendedCost.Amount);

      costByService[serviceName] = costByService[serviceName] || {};
      costByService[serviceName][costDate] = (costByService[serviceName][costDate] || 0) + cost;
    }
  }

  return costByService;
}

export async function getRawCostByService(awsConfig: AWSConfig): Promise<RawCostByService> {
  showSpinner('Getting pricing data');

  // Start of last month up to (and including) yesterday
  const startDate = dayjs().subtract(1, 'month').startOf('month');
  const endDate = dayjs().startOf('day');

  return getDailyCostByService(awsConfig, startDate, endDate);
}

export type TotalCosts = {
  totals: {
    lastMonth: number;
    thisMonth: number;
    last7Days: number;
    yesterday: number;
  };
  totalsByService: {
    lastMonth: { [key: string]: number };
    thisMonth: { [key: string]: number };
    last7Days: { [key: string]: number };
    yesterday: { [key: string]: number };
  };
};

function calculateServiceTotals(rawCostByService: RawCostByService): TotalCosts {
  const totals = {
    lastMonth: 0,
    thisMonth: 0,
    last7Days: 0,
    yesterday: 0,
  };

  const totalsByService = {
    lastMonth: {},
    thisMonth: {},
    last7Days: {},
    yesterday: {},
  };

  const today = dayjs().startOf('day');
  const startOfLastMonth = today.subtract(1, 'month').startOf('month');
  const startOfThisMonth = today.startOf('month');
  const startOfLast7Days = today.subtract(7, 'day');
  const yesterday = today.subtract(1, 'day');

  for (const service of Object.keys(rawCostByService)) {
    const servicePrices = rawCostByService[service];

    let lastMonthServiceTotal = 0;
    let thisMonthServiceTotal = 0;
    let last7DaysServiceTotal = 0;
    let yesterdayServiceTotal = 0;

    for (const date of Object.keys(servicePrices)) {
      const price = servicePrices[date];
      const dateObj = dayjs(date);

      if (dateObj.isSame(startOfLastMonth, 'month')) {
        lastMonthServiceTotal += price;
      }

      if (dateObj.isSame(startOfThisMonth, 'month')) {
        thisMonthServiceTotal += price;
      }

      // The 7 full days ending yesterday
      if (!dateObj.isBefore(startOfLast7Days, 'day') && dateObj.isBefore(today, 'day')) {
        last7DaysServiceTotal += price;
      }

      if (dateObj.isSame(yesterday, 'day')) {
        yesterdayServiceTotal += price;
      }
    }

    totalsByService.lastMonth[service] = lastMonthServiceTotal;
    totalsByService.thisMonth[service] = thisMonthServiceTotal;
    totalsByService.last7Days[service] = last7DaysServiceTotal;
    totalsByService.yesterday[service] = yesterdayServiceTotal;

    totals.lastMonth += lastMonthServiceTotal;
    totals.thisMonth += thisMonthServiceTotal;
    totals.last7Days += last7DaysServiceTotal;
    totals.yesterday += yesterdayServiceTotal;
  }

  return {
    totals,
    totalsByService,
  };
}

export async function getTotalCosts(awsConfig: AWSConfig): Promise<TotalCosts> {
  const rawCosts = await getRawCostByService(awsConfig);
  const totals = calculateServiceTotals(rawCosts);

  return totals;
}

export type MonthlyCosts = {
  /** First day of the reported month */
  month: Dayjs;
  /** First day of the month before it, used for comparison */
  previousMonth: Dayjs;
  total: number;
  previousTotal: number;
  byService: { [service: string]: number };
  previousByService: { [service: string]: number };
  /** Total cost per day of the reported month, keyed YYYY-MM-DD */
  byDay: { [date: string]: number };
};

/**
 * Costs for one full calendar month, plus the month before it for comparison.
 * @param month Any day inside the month to report on
 */
export async function getMonthlyCosts(awsConfig: AWSConfig, month: Dayjs): Promise<MonthlyCosts> {
  showSpinner('Getting monthly pricing data');

  const startOfMonth = month.startOf('month');
  const startOfPreviousMonth = startOfMonth.subtract(1, 'month');
  const startOfNextMonth = startOfMonth.add(1, 'month');

  // Never ask for days that haven't happened yet
  const today = dayjs().startOf('day');
  const endDate = startOfNextMonth.isAfter(today) ? today : startOfNextMonth;

  const raw = await getDailyCostByService(awsConfig, startOfPreviousMonth, endDate);

  const result: MonthlyCosts = {
    month: startOfMonth,
    previousMonth: startOfPreviousMonth,
    total: 0,
    previousTotal: 0,
    byService: {},
    previousByService: {},
    byDay: {},
  };

  for (const service of Object.keys(raw)) {
    result.byService[service] = 0;
    result.previousByService[service] = 0;

    for (const [date, cost] of Object.entries(raw[service])) {
      const dateObj = dayjs(date);

      if (dateObj.isSame(startOfMonth, 'month')) {
        result.byService[service] += cost;
        result.total += cost;
        result.byDay[date] = (result.byDay[date] || 0) + cost;
      } else if (dateObj.isSame(startOfPreviousMonth, 'month')) {
        result.previousByService[service] += cost;
        result.previousTotal += cost;
      }
    }
  }

  return result;
}
