import { Identity } from '@overture-stack/ego-token-middleware';
import moment from 'moment';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import logger from '../logger';
import attestationRequiredNotification from './attestationRequiredNotification';
import pauseAppCheck from './pauseAppCheck';
import { ReportItem, Report } from './types';
import { getEmptyReport } from './utils';

export default async function (
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  user: Identity,
) {
  logger.info('Initiating batch jobs...');
  // define currentDate here so each job has the same reference date
  const currentDate = moment.utc().toDate();

  // define report to collect all modified appIds
  // each job will return its own report
  // and this function will build a complete summary
  // can simply log the summary for now until we decide what to do with it

  // a try/catch around the whole thing
  try {
    const attestationNotificationReport = await attestationRequiredNotification(
      currentDate,
      emailClient,
    );
    const pausedAppReport = await pauseAppCheck(currentDate, emailClient, user);
    logger.info('All batch jobs completed, generating report');
    const completeReport: Report = {
      attestationNotifications: attestationNotificationReport,
      pausedApps: pausedAppReport,
      expiryNotifications1: getEmptyReport(),
      expiryNotifications2: getEmptyReport(),
      expiredApps: getEmptyReport(),
    };
    logger.info('BATCH JOBS - Logging report:');
    logger.info(JSON.stringify(completeReport));
    // TODO: Slack integration for visibility
  } catch (err) {
    logger.error(`Batch jobs failed with error: ${err}`);
    logger.error(err as Error);
  }

  // TODO: implement expiry/renewal jobs. Add to report
  // TODO: add DACO report step to finish (existing cron job will reach out to this endpoint only)
}
