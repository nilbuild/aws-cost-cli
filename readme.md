## aws-cost-cli
> CLI tool to perform cost analysis on your AWS account with Slack integration

![](.github/images/aws-cost.gif)

## Installation

Install the package globally or alternatively you can also use `npx`

```bash
npm install -g aws-cost-cli
```

## Usage

For the simple usage, just run the command without any options. 

```
aws-cost
```

The output will be a the totals with breakdown by service. Optionally, you can pass the following options to modify the output:

```bash
$ aws-cost --help

  Usage: aws-cost [options]

  A CLI tool to perform cost analysis on your AWS account

  Options:
    -V, --version                  output the version number

    -k, --access-key [key]         AWS access key
    -s, --secret-key [key]         AWS secret key
    -r, --region [region]          AWS region (default: us-east-1)

    -p, --profile [profile]        AWS profile to use (default: "default")

    -j, --json                     Get the output as JSON
    -u, --summary                  Get only the summary without service breakdown
    -t, --text                     Get the output as plain text (no colors / tables)

    -S, --slack-token [token]      Slack token for the slack message
    -C, --slack-channel [channel]  Slack channel to post the message to

    -v, --version                  Get the version of the CLI
    -h, --help                     Get the help of the CLI
```

In order to use the CLI you can either pass the AWS credentials through the options i.e.:

```bash
aws-cost -k [key] -s [secret] -r [region]
```

or if you have configured the credentials using [aws-cli](https://github.com/aws/aws-cli), you can simply run the following command:

```bash
aws-cost
```

To configure the credentials using aws-cli, have a look at the [aws-cli docs](https://github.com/aws/aws-cli#configuration) for more information.

### Docker

You can build this Dockerfile using the docker build command and then run a container from the built image. For example:

```
docker build -t aws-cost-cli .
docker run aws-cost-cli
```

## Detailed Breakdown
> The default usage is to get the cost breakdown by service

```bash
aws-cost
```
You will get the following output

![Default Usage](./.github/images/default-demo.gif)

## Total Costs
> You can also get the summary of the cost without the service breakdown

```bash
aws-cost --summary
```
You will get the following output

![Summary Usage](./.github/images/summary-demo.gif)

## Plain Text
> You can also get the output as plain text

```bash
aws-cost --text
```
You will get the following output in response

![Text Usage](./.github/images/text-usage.png)

## JSON Output
> You can also get the output as JSON

```bash
aws-cost --json
```

<details>
  <summary>You will get the following output in response</summary>

```json
{
  "account": "theroadmap",
  "totals": {
    "lastMonth": 0.38,
    "thisMonth": 11.86,
    "last7Days": 1.29,
    "yesterday": 0.22
  },
  "totalsByService": {
    "lastMonth": {
      "AmazonCloudWatch": 0,
      "Tax": 0,
      "AWS Key Management Service": 0,
      "AWS Service Catalog": 0,
      "Amazon Simple Email Service": 0.38,
      "Amazon Simple Notification Service": 0,
      "Amazon Simple Storage Service": 0.00001
    },
    "thisMonth": {
      "AmazonCloudWatch": 0,
      "Tax": 0,
      "AWS Key Management Service": 0,
      "AWS Service Catalog": 0,
      "Amazon Simple Email Service": 11.85,
      "Amazon Simple Notification Service": 0,
      "Amazon Simple Storage Service": 0
    },
    "last7Days": {
      "AmazonCloudWatch": 0,
      "Tax": 0,
      "AWS Key Management Service": 0,
      "AWS Service Catalog": 0,
      "Amazon Simple Email Service": 1.28,
      "Amazon Simple Notification Service": 0,
      "Amazon Simple Storage Service": 0
    },
    "yesterday": {
      "AmazonCloudWatch": 0,
      "Tax": 0,
      "AWS Key Management Service": 0,
      "AWS Service Catalog": 0,
      "Amazon Simple Email Service": 0.22,
      "Amazon Simple Notification Service": 0,
      "Amazon Simple Storage Service": 0
    }
  }
}
```
</details>

## Slack Integration

> You can also get the output as a slack message

You will need to create [a slack app](https://api.slack.com/apps?new_app=1), visit the **OAuth & Permissions** tab, and add the `chat:write` and `chat:write.public` scopes. Then create an OAuth token from the "OAuth Tokens" section and pass it to the CLI.

> **Note:** The `--slack-channel` is the [channel id](https://stackoverflow.com/questions/40940327/what-is-the-simplest-way-to-find-a-slack-team-id-and-a-channel-id#answer-44883343), not the name.

```bash
aws-cost --slack-token [token] --slack-channel [channel]
```

You will get the message on slack with the breakdown:

![Slack Usage](./.github/images/slack-usage.png)

You can set up a GitHub [workflow similar to this](https://github.com/kamranahmedse/developer-roadmap/blob/c1a53cf3cc5c9b77634673754c8a5af4e83466d6/.github/workflows/aws-costs.yml#L1) which can send the daily cost breakdown to Slack.

## Run on AWS Lambda (scheduled Slack reports)

The same cost analysis can run as a Lambda function on a schedule and post to Slack. Two reports:

- **Daily** (default: every day 09:00): yesterday, last 7 days, this month and last month, plus a per-service breakdown for yesterday.
- **Monthly** (default: 1st of each month 09:00): a full plain-text report for the month that just ended. It covers the total, the change vs the month before, daily average, most and least expensive days, cost per service with change and share, the biggest changes, and the cost of every day. Long reports are split into several Slack messages.

**Daily report in Slack**

![Daily Slack Report](./.github/images/lambda-daily-slack.png)

**Monthly report in Slack**

![Monthly Slack Report](./.github/images/lambda-monthly-slack.png)

### Deploy

You need Node.js, `zip`, and the AWS CLI logged in to the account you want to report on.

```bash
SLACK_TOKEN=xoxb-your-bot-token \
SLACK_CHANNEL='#aws-costs' \
SCHEDULE_TIMEZONE=Asia/Kolkata \
./deploy.sh
```

All settings sit at the top of `deploy.sh` and can be passed as environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `DAILY_SCHEDULE` | `cron(0 9 * * ? *)` | When the daily report runs |
| `MONTHLY_SCHEDULE` | `cron(0 9 1 * ? *)` | When the monthly report runs (reports the previous month) |
| `SCHEDULE_TIMEZONE` | `UTC` | Timezone for both schedules |
| `SLACK_TOKEN` / `SLACK_CHANNEL` | | Bot token with `chat:write` scope and the channel (invite the bot to it) |
| `SLACK_WEBHOOK_URL` | | Incoming webhook, instead of token + channel |
| `ACCOUNT_NAME` | account alias | Label shown in the reports |
| `SUMMARY_ONLY` | `false` | Daily report without the service breakdown |

Schedule format is EventBridge Scheduler's `cron(minutes hours day-of-month month day-of-week year)`; `rate(12 hours)` also works. To change a schedule later, run `./deploy.sh` again with new values. You can also deploy `template.yaml` with `sam deploy --guided` instead.

### Run it by hand

```bash
aws lambda invoke --function-name <function> --cli-binary-format raw-in-base64-out \
  --payload '{"reportType":"monthly","month":"2026-09"}' /dev/stdout
```

Event fields: `reportType` (`daily` or `monthly`), `month` (`YYYY-MM`, monthly only), `summary` (true/false, daily only), `dryRun` (true = only log the report, don't post to Slack).

The function uses its own IAM role (`ce:GetCostAndUsage`, `iam:ListAccountAliases`), so no access keys are stored. Each run makes 1–2 Cost Explorer requests (about $0.01 each), roughly $0.35–0.70 a month.

## Note

Regarding the credentials, you need to have the following permissions in order to use the CLI:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VisualEditor0",
      "Effect": "Allow",
      "Action": [
        "iam:ListAccountAliases",
        "ce:GetCostAndUsage"
      ],
      "Resource": "*"
    }
  ]
}
```

Also, please note that this tool uses AWS Cost Explorer under the hood which [costs $0.01 per request](https://aws.amazon.com/aws-cost-management/aws-cost-explorer/pricing/).

## License
MIT &copy; [Kamran Ahmed](https://twitter.com/kamranahmedse)
