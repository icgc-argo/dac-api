import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import moment from 'moment';
import { FilterQuery } from 'mongoose';
import { chunk } from 'lodash';

import logger from '../logger';
import { AppConfig, getAppConfig } from '../config';
import { NOTIFICATION_UNIT_OF_TIME, REQUEST_CHUNK_SIZE } from '../utils/constants';
import { ApplicationDocument, ApplicationModel } from '../domain/model';
import { Application } from '../domain/interface';
import { buildReportDetails, getEmptyReportDetails, setEmailSentFlag } from './utils';
import { sendAttestationRequiredEmail } from '../domain/service/emails';
import { BatchJobDetails, JobReport, JobResultForApplication } from './types';

export const JOB_NAME = 'ATTESTATION REQUIRED NOTIFICATIONS';

// Check + notification for applications entering attestation period
async function attestationRequiredNotificationCheck(
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<JobReport<BatchJobDetails>> {
  const startedAt = new Date();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    const details = await getAttestableNotificationReportDetails(currentDate, emailClient);
    details.errors.length
      ? logger.warn(`${JOB_NAME} - Completed with errors.`)
      : logger.info(`${JOB_NAME} - Completed.`);
    const finishedAt = new Date();
    const jobSuccessReport: JobReport<BatchJobDetails> = {
      jobName: JOB_NAME,
      startedAt,
      finishedAt,
      success: true,
      details,
    };
    logger.info(`${JOB_NAME} - Report: ${JSON.stringify(jobSuccessReport)}`);
    return jobSuccessReport;
  } catch (err) {
    logger.error(`${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`);
    const finishedAt = new Date();
    const jobFailedReport: JobReport<BatchJobDetails> = {
      jobName: JOB_NAME,
      startedAt,
      finishedAt,
      success: false,
      error: `${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`,
    };
    logger.error(`${JOB_NAME} - Report: ${JSON.stringify(jobFailedReport)}`);
    return jobFailedReport;
  }
}

const sendNotification = async (
  app: Application,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
): Promise<JobResultForApplication> => {
  try {
    await sendAttestationRequiredEmail(app, config, emailClient);
    const updatedApp = await setEmailSentFlag(app, 'attestationRequiredNotificationSent', JOB_NAME);
    return { success: true, app: updatedApp };
  } catch (err: unknown) {
    // Error thrown in one of our async operations
    logger.error(
      `${JOB_NAME} - Error caught while sending attestation required email for ${app.appId} - ${err}`,
    );
    return { success: false, app, message: `${err}` };
  }
};

const getAttestableNotificationReportDetails = async (
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<BatchJobDetails> => {
  const config = getAppConfig();
  const query = getAttestableQuery(config, currentDate);
  const attestableAppCount = await ApplicationModel.find(query).countDocuments();
  if (attestableAppCount === 0) {
    logger.info(`${JOB_NAME} - No applications require attestation.`);
    logger.info(`${JOB_NAME} - Generating report.`);
    return getEmptyReportDetails();
  }
  logger.info(`${JOB_NAME} - ${attestableAppCount} applications require attestation.`);
  const attestableApps = await ApplicationModel.find(query).exec();
  const apps: Application[] = attestableApps.map((app: ApplicationDocument) => {
    return app.toObject();
  });

  logger.info(`${JOB_NAME} - Initiating email requests.`);
  const chunkedEmails = chunk(apps, REQUEST_CHUNK_SIZE);
  const results: JobResultForApplication[][] = [];
  for (const email of chunkedEmails) {
    const result = await Promise.all(
      email.map((app) => sendNotification(app, emailClient, config)),
    );
    results.push(result);
  }
  const allResults = results.flat();
  logger.info(`${JOB_NAME} - Generating report.`);
  const attestationNotificationReport = buildReportDetails(
    allResults,
    'attestationNotifications',
    JOB_NAME,
  );
  return attestationNotificationReport;
};

const getAttestableQuery = (
  config: AppConfig,
  currentDate: Date,
): FilterQuery<ApplicationDocument> => {
  const {
    durations: {
      attestation: { count, unitOfTime, daysToAttestation },
    },
  } = config;
  // find all apps that are APPROVED with an approval date matching the configured time period minus configured daysToAttestation
  // default is 1 year less 45 days to match DACO
  // we use a range here from (1 year) to (1 year - 45 days) to account for missed job runs or email send failures
  const referenceDate = moment(currentDate).utc();
  const startDate = moment(referenceDate).subtract(count, unitOfTime);
  const startOfRange = moment(startDate).startOf('day').toDate();
  const endOfRange = moment(startDate)
    .add(daysToAttestation, NOTIFICATION_UNIT_OF_TIME)
    .endOf('day')
    .toDate();
  // add expiry to query to account for possible custom expiry dates
  const expiryThreshold = moment(referenceDate).endOf('day').toDate();

  logger.info(`${JOB_NAME} - [approvedAtUtc] date range is ${startOfRange} to ${endOfRange}.`);
  logger.info(`${JOB_NAME} - [expiresAtUtc] date threshold is ${expiryThreshold}.`);

  const query: FilterQuery<ApplicationDocument> = {
    state: 'APPROVED',
    approvedAtUtc: {
      $gte: startOfRange,
      $lte: endOfRange,
    },
    expiresAtUtc: {
      $gt: expiryThreshold,
    },
    // check the applicant has not already attested. Will only be undefined or a datestring
    attestedAtUtc: { $exists: false },
    // check email has not already been sent. Should only be undefined or a datestring.
    // We do not set the value at all if the email op has failed on a previous run
    'emailNotifications.attestationRequiredNotificationSent': { $exists: false },
  };

  return query;
};

export default attestationRequiredNotificationCheck;
