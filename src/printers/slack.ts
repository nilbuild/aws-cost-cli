import fetch from 'node-fetch';
import { TotalCosts } from '../cost';

export type SlackTarget = {
  /** Bot token (xoxb-...) used with chat.postMessage */
  token?: string;
  /** Channel name or ID, needed together with the token */
  channel?: string;
  /** Incoming webhook URL, an alternative to token + channel */
  webhookUrl?: string;
};

/**
 * Formats the costs by service into a string
 *
 * @param costs Cost breakdown for account
 * @returns formatted message
 */
function formatServiceBreakdown(costs: TotalCosts): string {
  const serviceCosts = costs.totalsByService;

  const sortedServices = Object.keys(serviceCosts.yesterday)
    .filter((service) => serviceCosts.yesterday[service] > 0)
    .sort((a, b) => serviceCosts.yesterday[b] - serviceCosts.yesterday[a]);

  const serviceCostsYesterday = sortedServices.map((service) => {
    return `> ${service}: \`$${serviceCosts.yesterday[service].toFixed(2)}\``;
  });

  return serviceCostsYesterday.join('\n');
}

/**
 * Builds the daily cost message (Slack mrkdwn)
 */
export function buildDailySlackMessage(accountAlias: string, costs: TotalCosts, isSummary: boolean): string {
  const totals = costs.totals;

  const summary = `> *Account: ${accountAlias}*

> *Summary *
> Total Yesterday: \`$${totals.yesterday.toFixed(2)}\`
> Total Last 7 Days: \`$${totals.last7Days.toFixed(2)}\`
> Total This Month: \`$${totals.thisMonth.toFixed(2)}\`
> Total Last Month: \`$${totals.lastMonth.toFixed(2)}\`
`;

  const breakdown = `
> *Breakdown by Service:*
${formatServiceBreakdown(costs)}
`;

  let message = `${summary}`;
  if (!isSummary) {
    message += `${breakdown}`;
  }

  return message;
}

/**
 * Posts one mrkdwn message to Slack. Throws if Slack rejects it.
 */
export async function postSlackMessage(target: SlackTarget, message: string) {
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: message } }];

  if (target.webhookUrl) {
    const response = await fetch(target.webhookUrl, {
      method: 'post',
      body: JSON.stringify({ text: message, blocks }),
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned ${response.status}: ${await response.text()}`);
    }
    return;
  }

  if (!target.token || !target.channel) {
    throw new Error('Slack needs either a webhook URL, or both a token and a channel');
  }

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'post',
    body: JSON.stringify({ channel: target.channel, text: message, blocks }),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${target.token}`,
    },
  });

  const data = (await response.json()) as { ok: boolean; error?: string };
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error || 'Unknown error'}`);
  }
}

// Slack shows at most 3000 characters in one section block
const MAX_BLOCK_CHARS = 2900;

/**
 * Posts a plain-text report as one or more code blocks, splitting on line
 * boundaries so long reports still arrive in full.
 */
export async function postSlackTextReport(target: SlackTarget, title: string, report: string) {
  const chunks: string[] = [];
  let current = '';

  for (const line of report.split('\n')) {
    if (current.length + line.length + 1 > MAX_BLOCK_CHARS && current) {
      chunks.push(current);
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) {
    chunks.push(current);
  }

  for (let i = 0; i < chunks.length; i++) {
    const part = chunks.length > 1 ? ` (${i + 1}/${chunks.length})` : '';
    await postSlackMessage(target, `*${title}*${part}\n\`\`\`\n${chunks[i].trimEnd()}\n\`\`\``);
  }
}

/**
 * Used by the CLI: sends the daily message and exits on failure.
 */
export async function notifySlack(
  accountAlias: string,
  costs: TotalCosts,
  isSummary: boolean,
  slackToken: string,
  slackChannel: string
) {
  try {
    await postSlackMessage(
      { token: slackToken, channel: slackChannel },
      buildDailySlackMessage(accountAlias, costs, isSummary)
    );
  } catch (error) {
    console.error(`\nFailed to send message to Slack: ${error.message}`);
    process.exit(1);
  }

  console.log('\nSuccessfully sent message to Slack');
}
