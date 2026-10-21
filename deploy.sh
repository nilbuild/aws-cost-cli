#!/usr/bin/env bash
# Builds the Lambda and deploys it (function + daily and monthly schedules)
# with CloudFormation. Needs: Node.js, npm, zip and the AWS CLI logged in.
#
# Edit the values below, or pass them as environment variables:
#   SLACK_TOKEN=xoxb-... SLACK_CHANNEL=#aws-costs ./deploy.sh
set -euo pipefail

# ---- Settings -------------------------------------------------------------
STACK_NAME="${STACK_NAME:-aws-cost-reports}"
REGION="${REGION:-us-east-1}"                       # where the Lambda runs
ARTIFACT_BUCKET="${ARTIFACT_BUCKET:-}"              # S3 bucket for the code zip; created if missing

DAILY_SCHEDULE="${DAILY_SCHEDULE:-cron(0 9 * * ? *)}"     # every day 09:00
MONTHLY_SCHEDULE="${MONTHLY_SCHEDULE:-cron(0 9 1 * ? *)}" # 1st of each month 09:00
SCHEDULE_TIMEZONE="${SCHEDULE_TIMEZONE:-UTC}"             # e.g. Asia/Kolkata, America/Los_Angeles

SLACK_TOKEN="${SLACK_TOKEN:-}"            # bot token, or use SLACK_WEBHOOK_URL instead
SLACK_CHANNEL="${SLACK_CHANNEL:-}"
SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
ACCOUNT_NAME="${ACCOUNT_NAME:-}"          # optional label in the reports
SUMMARY_ONLY="${SUMMARY_ONLY:-false}"     # true = daily report without service breakdown
# ---------------------------------------------------------------------------

if [[ -z "$SLACK_WEBHOOK_URL" && ( -z "$SLACK_TOKEN" || -z "$SLACK_CHANNEL" ) ]]; then
  echo "Set SLACK_WEBHOOK_URL, or both SLACK_TOKEN and SLACK_CHANNEL." >&2
  exit 1
fi

cd "$(dirname "$0")"

if [[ -z "$ARTIFACT_BUCKET" ]]; then
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  ARTIFACT_BUCKET="${STACK_NAME}-artifacts-${ACCOUNT_ID}-${REGION}"
fi
if ! aws s3api head-bucket --bucket "$ARTIFACT_BUCKET" 2>/dev/null; then
  echo "Creating S3 bucket $ARTIFACT_BUCKET"
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$ARTIFACT_BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$ARTIFACT_BUCKET" --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  fi
fi

echo "Building..."
npm install --silent
npm run build --silent

echo "Packaging..."
aws cloudformation package \
  --region "$REGION" \
  --template-file template.yaml \
  --s3-bucket "$ARTIFACT_BUCKET" \
  --output-template-file packaged.yaml >/dev/null

echo "Deploying stack $STACK_NAME..."
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "$STACK_NAME" \
  --template-file packaged.yaml \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "DailySchedule=$DAILY_SCHEDULE" \
    "MonthlySchedule=$MONTHLY_SCHEDULE" \
    "ScheduleTimezone=$SCHEDULE_TIMEZONE" \
    "SlackToken=$SLACK_TOKEN" \
    "SlackChannel=$SLACK_CHANNEL" \
    "SlackWebhookUrl=$SLACK_WEBHOOK_URL" \
    "AccountName=$ACCOUNT_NAME" \
    "SummaryOnly=$SUMMARY_ONLY"

FUNCTION=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='FunctionName'].OutputValue" --output text)

echo
echo "Done. Function: $FUNCTION"
echo "Test it now:"
echo "  aws lambda invoke --region $REGION --function-name $FUNCTION --cli-binary-format raw-in-base64-out --payload '{\"reportType\":\"daily\"}' /dev/stdout"
echo "  aws lambda invoke --region $REGION --function-name $FUNCTION --cli-binary-format raw-in-base64-out --payload '{\"reportType\":\"monthly\"}' /dev/stdout"
