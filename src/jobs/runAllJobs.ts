import { Identity } from '@overture-stack/ego-token-middleware';
import moment from 'moment';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import logger from '../logger';
import attestationRequiredNotification from './attestationRequiredNotification';
import runPauseAppsCheck from './pauseAppCheck';
import approvedUsersEmail from './approvedUsersEmail';
import firstExpiryNotificationCheck from './firstExpiryNotification';
import secondExpiryNotificationCheck from './secondExpiryNotification';
import { Report, JobReport } from './types';

const JOB_NAME = 'ALL BATCH JOBS';

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
    );
    const pausedAppReport = await runPauseAppsCheck(currentDate, emailClient, user);
    const firstExpiryNotificationReport = await firstExpiryNotificationCheck(
      currentDate,
      emailClient,
    );
    const secondExpiryNotificationReport = await secondExpiryNotificationCheck(
      currentDate,
      emailClient,
    );
    // TODO: const expiredAppsReport
    // TODO: const closedAppsReport
    const approvedUsersEmailReport = await approvedUsersEmail(emailClient);
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
      expiryNotifications1: firstExpiryNotificationReport,
      expiryNotifications2: secondExpiryNotificationReport,
      expiredApps: getReportToBeImplemented('EXPIRING APPLICATIONS'),
      closedApps: getReportToBeImplemented('CLOSING EXPIRED APPLICATIONS'),
      approvedUsers: approvedUsersEmailReport,
    };
    logger.info(`${JOB_NAME} - Logging report`);
    logger.info(`${JOB_NAME} - ${JSON.stringify(completeReport)}`);
    // TODO: Slack integration for report/error visibility
  } catch (err) {
    logger.error(`${JOB_NAME} - failed with error: ${err}`);
    logger.error(`${JOB_NAME} - ${err as Error}`);
  }
}
