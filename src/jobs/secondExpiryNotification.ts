import moment from 'moment';
import { FilterQuery } from 'mongoose';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { chunk } from 'lodash';

import logger from '../logger';
import { AppConfig, getAppConfig } from '../config';
import { NOTIFICATION_UNIT_OF_TIME, REQUEST_CHUNK_SIZE } from '../utils/constants';
import { ApplicationDocument, ApplicationModel } from '../domain/model';
import { Application } from '../domain/interface';
import { buildReportDetails, getEmptyReportDetails, setEmailSentFlag } from './utils';
import { sendAccessExpiringEmail } from '../domain/service/emails';
import { BatchJobDetails, JobReport, JobResultForApplication } from './types';

const JOB_NAME = 'SECOND EXPIRY NOTIFICATIONS';

/**
 * ```
 * Batch job to find all applications still within the renewal period (expiresAtUtc - DAYS_TO_EXPIRY_2) and send a second notification to the applicant
 * Returns a BatchJobReport with details on appIds retrieved, report start and end time, job success status, and any errors encountered
 * Query uses a date range (DAYS_TO_EXPIRY_2 to expiresAtUtc) to account for days where the batch job run may have been missed
 * Sets a flag on the app, secondExpiryNotificationSent, to indicate an email has been sent and application can be ignored on a subsequent run
 * ```
 * @param currentDate
 * @param emailClient
 * @returns BatchJobReport
 * @example
 * // returns {
 *  "jobName":"SECOND EXPIRY NOTIFICATIONS",
 *  "startedAt":"2023-01-20T08:00:04.817Z",
 *  "finishedAt":"2023-01-20T08:00:05.394Z",
 *  "success":true,
 *  "details":{
 *    "ids":[],
 *    "count":0,
 *    "errors":[],
 *    "errorCount":0
 *   }
 * }
 */
async function secondExpiryNotificationCheck(
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<JobReport<BatchJobDetails>> {
  const startedAt = new Date();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    const details = await getSecondExpiryNotificationReportDetails(currentDate, emailClient);
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
  const {
    durations: {
      expiry: { daysToExpiry2 },
    },
  } = config;
  try {
    await sendAccessExpiringEmail(app, config, daysToExpiry2, emailClient);
    const updatedApp = await setEmailSentFlag(app, 'secondExpiryNotificationSent', JOB_NAME);
    return { success: true, app: updatedApp };
  } catch (err: unknown) {
    // Error thrown in one of our async operations
    logger.error(
      `${JOB_NAME} - Error caught while sending second app expiring email for ${app.appId} - ${err}`,
    );
    return { success: false, app, message: `${err}` };
  }
};

const getSecondExpiryNotificationReportDetails = async (
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<BatchJobDetails> => {
  const config = getAppConfig();
  const query = getSecondExpiryQuery(config, currentDate);
  const appCount = await ApplicationModel.find(query).countDocuments();
  if (appCount === 0) {
    logger.info(`${JOB_NAME} - No applications require a second expiry notification.`);
    logger.info(`${JOB_NAME} - Generating report.`);
    return getEmptyReportDetails();
  }
  logger.info(`${JOB_NAME} - ${appCount} applications require a second expiry notification.`);
  const expiringApps = await ApplicationModel.find(query).exec();
  const apps: Application[] = expiringApps.map((app: ApplicationDocument) => {
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
  const expiringNotificationReport = buildReportDetails(
    allResults,
    'expiryNotifications2',
    JOB_NAME,
  );
  return expiringNotificationReport;
};

const getSecondExpiryQuery = (
  config: AppConfig,
  currentDate: Date,
): FilterQuery<ApplicationDocument> => {
  const referenceDate = moment(currentDate).utc();
  const {
    durations: {
      expiry: { daysToExpiry2 },
    },
  } = config;
  // is expiry between 45 days in the future and today
  const upperThreshold = moment(referenceDate)
    .add(daysToExpiry2, NOTIFICATION_UNIT_OF_TIME)
    .startOf('day')
    .toDate();

  const lowerThreshold = moment(referenceDate).endOf('day').toDate();
  const query: FilterQuery<ApplicationDocument> = {
    state: {
      $in: ['APPROVED', 'PAUSED'],
    },
    expiresAtUtc: {
      $gt: lowerThreshold,
      $lt: upperThreshold,
    },
    'emailNotifications.secondExpiryNotificationSent': { $exists: false },
  };

  return query;
};

export default secondExpiryNotificationCheck;
