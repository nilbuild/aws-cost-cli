import dayjs from 'dayjs';
import { MonthlyCosts } from '../cost';

function money(amount: number): string {
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function change(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0 ? '0.0%' : 'new';
  }
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/**
 * Builds the full monthly cost report as plain text.
 * @param minServiceCost services below this amount in both months are grouped as "Other"
 */
export function buildMonthlyTextReport(accountAlias: string, costs: MonthlyCosts, minServiceCost = 0.01): string {
  const monthLabel = costs.month.format('MMMM YYYY');
  const prevLabel = costs.previousMonth.format('MMM YYYY');
  const curShort = costs.month.format('MMM YYYY');

  const days = Object.keys(costs.byDay).sort();
  const daysCounted = days.length || 1;
  const dailyAverage = costs.total / daysCounted;

  let highestDay = '';
  let lowestDay = '';
  for (const day of days) {
    if (!highestDay || costs.byDay[day] > costs.byDay[highestDay]) highestDay = day;
    if (!lowestDay || costs.byDay[day] < costs.byDay[lowestDay]) lowestDay = day;
  }

  const services = Object.keys(costs.byService).sort((a, b) => costs.byService[b] - costs.byService[a]);
  const shown = services.filter(
    (s) => costs.byService[s] >= minServiceCost || costs.previousByService[s] >= minServiceCost
  );
  const hidden = services.filter((s) => !shown.includes(s));

  // Service table columns; divider lines match the table's full width
  const nameWidth = Math.min(40, Math.max(20, ...shown.map((s) => s.length)) + 2);
  const col = 13;
  const width = nameWidth + col * 2 + 9 + 8;

  const lines: string[] = [];
  const rule = '='.repeat(width);
  const thin = '-'.repeat(width);

  lines.push(`AWS MONTHLY COST REPORT - ${monthLabel}`);
  lines.push(`Account: ${accountAlias}`);
  lines.push(`Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`);
  lines.push(rule);
  lines.push('');

  // --- Summary
  lines.push('SUMMARY');
  lines.push(thin);
  lines.push(`Total cost (${curShort}):`.padEnd(30) + money(costs.total));
  lines.push(`Previous month (${prevLabel}):`.padEnd(30) + money(costs.previousTotal));
  lines.push(
    'Change vs previous month:'.padEnd(30) +
      `${costs.total - costs.previousTotal >= 0 ? '+' : '-'}${money(Math.abs(costs.total - costs.previousTotal))} (${change(
        costs.total,
        costs.previousTotal
      )})`
  );
  lines.push('Daily average:'.padEnd(30) + money(dailyAverage));
  if (highestDay) {
    lines.push('Most expensive day:'.padEnd(30) + `${highestDay}  ${money(costs.byDay[highestDay])}`);
    lines.push('Cheapest day:'.padEnd(30) + `${lowestDay}  ${money(costs.byDay[lowestDay])}`);
  }
  if (!costs.month.isBefore(dayjs().startOf('month'))) {
    lines.push('');
    lines.push(`Note: ${monthLabel} is not over yet; this covers ${days.length} day(s) so far.`);
  }
  lines.push('');

  // --- By service
  lines.push('COST BY SERVICE');
  lines.push(thin);
  lines.push(
    'Service'.padEnd(nameWidth) +
      curShort.padStart(col) +
      prevLabel.padStart(col) +
      'Change'.padStart(9) +
      'Share'.padStart(8)
  );
  lines.push(thin);

  const row = (name: string, cur: number, prev: number) => {
    const label = name.length > nameWidth - 1 ? name.slice(0, nameWidth - 2) + '…' : name;
    const share = costs.total > 0 ? `${((cur / costs.total) * 100).toFixed(1)}%` : '-';
    return (
      label.padEnd(nameWidth) +
      money(cur).padStart(col) +
      money(prev).padStart(col) +
      change(cur, prev).padStart(9) +
      share.padStart(8)
    );
  };

  for (const service of shown) {
    lines.push(row(service, costs.byService[service], costs.previousByService[service]));
  }
  if (hidden.length) {
    const cur = hidden.reduce((sum, s) => sum + costs.byService[s], 0);
    const prev = hidden.reduce((sum, s) => sum + costs.previousByService[s], 0);
    lines.push(row(`Other (${hidden.length} services)`, cur, prev));
  }
  lines.push(thin);
  lines.push(row('TOTAL', costs.total, costs.previousTotal));
  lines.push('');

  // --- Biggest movers
  const movers = services
    .map((s) => ({ service: s, diff: costs.byService[s] - costs.previousByService[s] }))
    .filter((m) => Math.abs(m.diff) >= 0.01)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 5);

  if (movers.length) {
    lines.push('BIGGEST CHANGES VS PREVIOUS MONTH');
    lines.push(thin);
    for (const m of movers) {
      lines.push(`${m.diff >= 0 ? '▲' : '▼'} ${m.service}`.padEnd(nameWidth + 2) + `${m.diff >= 0 ? '+' : '-'}${money(Math.abs(m.diff))}`);
    }
    lines.push('');
  }

  // --- Daily breakdown
  lines.push('DAILY COST');
  lines.push(thin);
  const maxDay = Math.max(0, ...days.map((d) => costs.byDay[d]));
  for (const day of days) {
    const cost = costs.byDay[day];
    const bar = maxDay > 0 ? '█'.repeat(Math.round((cost / maxDay) * 30)) : '';
    lines.push(`${day} ${dayjs(day).format('ddd')}  ${money(cost).padStart(12)}  ${bar}`);
  }
  lines.push('');
  lines.push('Costs exclude credits, refunds, upfront fees and support (unblended cost).');

  return lines.join('\n');
}
