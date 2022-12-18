import { Identity } from '@overture-stack/ego-token-middleware';
import moment from 'moment';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import logger from '../logger';
import attestationRequiredNotification from './attestationRequiredNotification';
import runPauseAppsCheck from './pauseAppCheck';
import { Report, JobReport } from './types';

const JOB_NAME = 'ALL BATCH JOBS';

// today lands between (approval + 1 year) to (approval + 1 year) - 45 days --> attestation required. state APPROVED
// today lands between (approval + 1 year) to (expiry) --> app pausing
// today lands between expiry - 90 days to expiry - 45 days --> first renewal notice. state APPROVED or PAUSED
// todays lands between expiry - 45 days to expiry --> second renewal notice. state APPROVED or PAUSED
// today lands between expiry and expiry + 90 days --> app expiring. state EXPIRED
// today lands on expiry or after --> app closing. state EXPIRED

export default async function (
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  user: Identity,
) {
  logger.info(`${JOB_NAME} - Initiating...`);
  // define currentDate here so each job has the same reference date
  const currentDate = moment.utc().toDate();

  try {
    const attestationNotificationReport = await attestationRequiredNotification(
      currentDate,
      emailClient,
      user,
    );
    const pausedAppReport = await runPauseAppsCheck(currentDate, emailClient, user);

    // define report to collect all affected appIds
    // each job will return its own report
    // this function will build a complete summary
    // will simply log the summary for now until we decide what to do with it
    logger.info(`${JOB_NAME} - Completed, generating report.`);
    // TODO: remove once expiry reports are implemented, just making ts happy
    const getReportToBeImplemented: (jobName: string) => JobReport<any> = (jobName) => ({
      jobName,
      startedAt: new Date(),
      finishedAt: new Date(),
      success: false,
    });
    const completeReport: Report = {
      attestationNotifications: attestationNotificationReport,
      pausedApps: pausedAppReport,
      // TODO: implement expiry/renewal jobs. Add to report
      expiryNotifications1: getReportToBeImplemented('FIRST EXPIRY NOTIFICATIONS'),
      expiryNotifications2: getReportToBeImplemented('SECOND EXPIRY NOTIFICATIONS'),
      expiredApps: getReportToBeImplemented('EXPIRING APPLICATIONS'),
    };
    logger.info(`${JOB_NAME} - Logging report`);
    logger.info(`${JOB_NAME} - ${JSON.stringify(completeReport)}`);
    // TODO: Slack integration for report/error visibility
  } catch (err) {
    logger.error(`${JOB_NAME} - failed with error: ${err}`);
    logger.error(`${JOB_NAME} - ${err as Error}`);
  }

  // TODO: add DACO report step to finish (existing cron job will reach out to this endpoint only)
}
