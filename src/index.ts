import { Command } from 'commander';
import packageJson from '../package.json' assert { type: 'json' };
import { getAccountAlias } from './account';
import { getAwsConfigFromOptionsOrFile } from './config';
import { getTotalCosts } from './cost';
import { printFancy } from './printers/fancy';
import { printJson } from './printers/json';
import { notifySlack } from './printers/slack';
import { printPlainText } from './printers/text';

const program = new Command();

program
  .version(packageJson.version)
  .name('aws-cost')
  .description(packageJson.description)
  .option('-p, --profile [profile]', 'AWS profile to use', 'default')
  // AWS credentials to override reading from the config files
  .option('-k, --access-key [key]', 'AWS access key')
  .option('-s, --secret-key [key]', 'AWS secret key')
  .option('-T, --session-token [key]', 'AWS session Token')
  .option('-r, --region [region]', 'AWS region', 'us-east-1')
  // Output variants
  .option('-j, --json', 'Get the output as JSON')
  .option('-u, --summary', 'Get only the summary without service breakdown')
  .option('-t, --text', 'Get the output as plain text (no colors / tables)')
  // Slack integration
  .option('-S, --slack-token [token]', 'Token for the slack integration')
  .option('-C, --slack-channel [channel]', 'Channel to which the slack integration should post')
  // Other options
  .option('-h, --help', 'Get the help of the CLI')
  .parse(process.argv);

type OptionsType = {
  // AWS credentials to override reading from the config files
  accessKey: string;
  secretKey: string;
  sessionToken: string;
  region: string;
  // AWS profile to use
  profile: string;
  // Output variants
  text: boolean;
  json: boolean;
  summary: boolean;
  // Slack token
  slackToken: string;
  slackChannel: string;
  // Other options
  help: boolean;
};

const options = program.opts<OptionsType>();

if (options.help) {
  program.help();
  process.exit(0);
}

const awsConfig = await getAwsConfigFromOptionsOrFile({
  profile: options.profile,
  accessKey: options.accessKey,
  secretKey: options.secretKey,
  sessionToken: options.sessionToken,
  region: options.region,
});

const alias = await getAccountAlias(awsConfig);

const costs = await getTotalCosts(awsConfig);

if (options.json) {
  printJson(alias, costs, options.summary);
} else if (options.text) {
  printPlainText(alias, costs, options.summary);
} else {
  printFancy(alias, costs, options.summary);
}

// Send a notification to slack if the token and channel are provided
if (options.slackToken && options.slackChannel) {
  await notifySlack(alias, costs, options.summary, options.slackToken, options.slackChannel);
}
