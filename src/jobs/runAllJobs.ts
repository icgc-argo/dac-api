import { Identity } from '@overture-stack/ego-token-middleware';
import moment from 'moment';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import logger from '../logger';
import attestationRequiredNotification from './attestationRequiredNotification';
import runPauseAppsCheck from './pauseAppCheck';
import runExpiringAppsCheck from './expireAppCheck';
import approvedUsersEmail from './approvedUsersEmail';
import firstExpiryNotificationCheck from './firstExpiryNotification';
import secondExpiryNotificationCheck from './secondExpiryNotification';
import runCloseUnsubmittedRenewalsCheck from './closeUnsubmittedRenewalsCheck';
import { JobReport, Report } from './types';
import { getAppConfig } from '../config';

const JOB_NAME = 'ALL BATCH JOBS';

// TODO: remove once expiry reports are implemented, just making ts happy
const getReportFeatureDisabled: (jobName: string) => JobReport<any> = (jobName) => {
  logger.warn(`${JOB_NAME} - ${jobName} job is not enabled.`);
  return { jobName, startedAt: new Date(), finishedAt: new Date(), success: false };
};

export default async function (
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  user: Identity,
) {
  logger.info(`${JOB_NAME} - Initiating...`);
  const {
    featureFlags: { renewalEnabled },
  } = getAppConfig();
  // define currentDate here so each job has the same reference date
  const currentDate = moment.utc().toDate();

  try {
    const attestationNotificationReport = await attestationRequiredNotification(
      currentDate,
      emailClient,
    );
    const pausedAppReport = await runPauseAppsCheck(currentDate, emailClient, user);
    const firstExpiryNotificationReport = renewalEnabled
      ? await firstExpiryNotificationCheck(currentDate, emailClient)
      : getReportFeatureDisabled('FIRST EXPIRY NOTIFICATIONS');
    const secondExpiryNotificationReport = renewalEnabled
      ? await secondExpiryNotificationCheck(currentDate, emailClient)
      : getReportFeatureDisabled('SECOND EXPIRY NOTIFICATIONS');
    const expiringAppsReport = renewalEnabled
      ? await runExpiringAppsCheck(currentDate, emailClient, user)
      : getReportFeatureDisabled('EXPIRING APPLICATIONS');
    const closedRenewalsReport = renewalEnabled
      ? await runCloseUnsubmittedRenewalsCheck(currentDate, user)
      : getReportFeatureDisabled('CLOSING UNSUBMITTED RENEWALS');
    const approvedUsersEmailReport = await approvedUsersEmail(emailClient);
    // define report to collect all affected appIds
    // each job will return its own report
    // this function will build a complete summary
    // will simply log the summary for now until we decide what to do with it
    logger.info(`${JOB_NAME} - Completed, generating report.`);

    const completeReport: Report = {
      attestationNotifications: attestationNotificationReport,
      pausedApps: pausedAppReport,
      expiryNotifications1: firstExpiryNotificationReport,
      expiryNotifications2: secondExpiryNotificationReport,
      expiredApps: expiringAppsReport,
      closedApps: closedRenewalsReport,
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
