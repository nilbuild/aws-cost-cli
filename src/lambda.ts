/**
 * AWS Lambda entry point.
 *
 * Two report types, picked by the event (EventBridge Scheduler passes it as
 * the schedule's input) or by the REPORT_TYPE env var:
 *
 *   { "reportType": "daily" }                      yesterday / last 7 days / this month / last month
 *   { "reportType": "monthly" }                    full text report for last month
 *   { "reportType": "monthly", "month": "2026-09" } full text report for a chosen month
 *
 * Environment variables:
 *   SLACK_TOKEN + SLACK_CHANNEL   bot token (chat:write scope) and channel, or
 *   SLACK_WEBHOOK_URL             an incoming webhook instead
 *   ACCOUNT_NAME                  optional label; defaults to the IAM account alias / account ID
 *   SUMMARY_ONLY                  "true" to leave the per-service breakdown out of the daily report
 *   MIN_SERVICE_COST              monthly report groups services cheaper than this as "Other" (default 0.01)
 *   REPORT_TYPE                   fallback when the event has no reportType (default "daily")
 */
import dayjs from 'dayjs';
import { getAccountAlias } from './account';
import { AWSConfig } from './config';
import { getMonthlyCosts, getTotalCosts } from './cost';
import { buildMonthlyTextReport } from './reports/monthly';
import { buildDailySlackMessage, postSlackMessage, postSlackTextReport, SlackTarget } from './printers/slack';

type ReportEvent = {
  reportType?: 'daily' | 'monthly';
  /** YYYY-MM, monthly only. Defaults to last month. */
  month?: string;
  /** Overrides SUMMARY_ONLY for the daily report */
  summary?: boolean;
  /** true = build the report and return it without posting to Slack */
  dryRun?: boolean;
};

// Cost Explorer only has an endpoint in us-east-1
const awsConfig: AWSConfig = { region: 'us-east-1' };

function slackTarget(): SlackTarget {
  return {
    token: process.env.SLACK_TOKEN,
    channel: process.env.SLACK_CHANNEL,
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
  };
}

async function accountName(): Promise<string> {
  if (process.env.ACCOUNT_NAME) {
    return process.env.ACCOUNT_NAME;
  }
  try {
    return await getAccountAlias(awsConfig);
  } catch (error) {
    console.warn(`Could not look up account alias: ${error.message}`);
    return 'AWS account';
  }
}

export async function handler(event: ReportEvent = {}) {
  const reportType = event?.reportType || (process.env.REPORT_TYPE as ReportEvent['reportType']) || 'daily';
  const dryRun = event?.dryRun === true;
  const account = await accountName();

  if (reportType === 'daily') {
    const summaryOnly = event?.summary ?? process.env.SUMMARY_ONLY === 'true';
    const costs = await getTotalCosts(awsConfig);
    const message = `*AWS Daily Cost Report - ${dayjs().subtract(1, 'day').format('ddd, D MMM YYYY')}*\n${buildDailySlackMessage(
      account,
      costs,
      summaryOnly
    )}`;

    console.log(message);
    if (!dryRun) {
      await postSlackMessage(slackTarget(), message);
    }
    return { reportType, account, totals: costs.totals, sentToSlack: !dryRun };
  }

  if (reportType === 'monthly') {
    let month = dayjs().subtract(1, 'month').startOf('month');
    if (event?.month) {
      month = dayjs(`${event.month}-01`);
      if (!month.isValid() || !/^\d{4}-\d{2}$/.test(event.month)) {
        throw new Error(`"month" must look like YYYY-MM, got "${event.month}"`);
      }
    }

    const minServiceCost = parseFloat(process.env.MIN_SERVICE_COST || '0.01');
    const costs = await getMonthlyCosts(awsConfig, month);
    const report = buildMonthlyTextReport(account, costs, minServiceCost);

    console.log(report);
    if (!dryRun) {
      await postSlackTextReport(slackTarget(), `AWS Monthly Cost Report - ${month.format('MMMM YYYY')}`, report);
    }
    return {
      reportType,
      account,
      month: month.format('YYYY-MM'),
      total: costs.total,
      previousTotal: costs.previousTotal,
      sentToSlack: !dryRun,
    };
  }

  throw new Error(`Unknown reportType "${reportType}". Use "daily" or "monthly".`);
}
