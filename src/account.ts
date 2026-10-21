import { IAMClient, ListAccountAliasesCommand } from '@aws-sdk/client-iam';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { AWSConfig } from './config';
import { showSpinner } from './logger';

export async function getAccountAlias(awsConfig: AWSConfig): Promise<string> {
  showSpinner('Getting account alias');

  const iam = new IAMClient(awsConfig);

  const accountAliases = await iam.send(new ListAccountAliasesCommand({}));
  const foundAlias = accountAliases?.AccountAliases?.[0];

  if (foundAlias) {
    return foundAlias;
  }

  const sts = new STSClient(awsConfig);

  const accountInfo = await sts.send(new GetCallerIdentityCommand({}));

  return accountInfo?.Account || '';
}
