import chalk from 'chalk';
import ora, { Ora } from 'ora';

export function printFatalError(error: string) {
  console.error(`  
    ${chalk.bold.redBright.underline(`Error:`)}
    ${chalk.redBright(`${error}`)}
  `);
  process.exit(1);
}

let spinner: Ora | undefined;

/**
 * Shows the spinner with the given text
 * @param text Text to show in the spinner
 */
export function showSpinner(text: string) {
  // No spinner when there is no terminal (e.g. on AWS Lambda)
  if (!process.stderr.isTTY) {
    return;
  }

  if (!spinner) {
    spinner = ora({ text: '' }).start();
  }

  spinner.text = text;
}

/**
 * Hides the spinner and removes the loading text
 * @returns undefined
 */
export function hideSpinner() {
  if (!spinner) {
    return;
  }

  spinner.stop();
}
