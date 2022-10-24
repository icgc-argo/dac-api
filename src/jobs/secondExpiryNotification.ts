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
import { buildReportDetails, getEmptyReportDetails } from './utils';
import { sendAccessExpiringEmail } from '../domain/service';
import { getDayRange } from '../utils/calculations';
import { BatchJobDetails, JobReport, JobResultForApplication } from './types';

const JOB_NAME = 'SECOND EXPIRY NOTIFICATIONS';

// 2nd notification for applications that have not begun renewal process (DAYS_TO_EXPIRY_2)
async function secondExpiryNotificationCheck(
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<JobReport<BatchJobDetails>> {
  const config = await getAppConfig();
  const startedAt = new Date();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    const details = await getReportDetails(currentDate, emailClient, config);
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

const getReportDetails = async (
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
): Promise<BatchJobDetails> => {
  const {
    durations: {
      expiry: { daysToExpiry2 },
    },
  } = config;
  const query = getQuery(config, currentDate);
  const appCount = await ApplicationModel.find(query).countDocuments();
  if (appCount === 0) {
    logger.info(`${JOB_NAME} - No applications require a second expiry notification.`);
    logger.info(`${JOB_NAME} - Generating report.`);
    return getEmptyReportDetails();
  }
  logger.info(`${JOB_NAME} - ${appCount} applications require a second expiry notification.`);
  const renewableApps = await ApplicationModel.find(query).exec();
  const apps: Application[] = renewableApps.map((app: ApplicationDocument) => {
    return app.toObject();
  });

  logger.info(`${JOB_NAME} - Initiating email requests.`);
  const sendNotification = async (app: Application): Promise<JobResultForApplication> => {
    try {
      await sendAccessExpiringEmail(app, config, daysToExpiry2, emailClient);
      return { success: true, app };
    } catch (err: unknown) {
      // Error thrown in one of our async operations
      logger.error(
        `${JOB_NAME} - Error caught while sending second expiry notification email for ${app.appId} - ${err}`,
      );
      return { success: false, app, message: `${err}` };
    }
  };
  const chunkedEmails = chunk(apps, REQUEST_CHUNK_SIZE);
  const results: JobResultForApplication[][] = [];
  for (const email of chunkedEmails) {
    const result = await Promise.all(email.map(sendNotification));
    results.push(result);
  }
  const allResults = results.flat();
  logger.info(`${JOB_NAME} - Generating report.`);
  const firstExpiryNotificationReport = buildReportDetails(
    allResults,
    'expiryNotifications2',
    JOB_NAME,
  );
  return firstExpiryNotificationReport;
};

const getQuery = (config: AppConfig, currentDate: Date): FilterQuery<ApplicationDocument> => {
  const {
    durations: {
      expiry: { daysToExpiry2 },
    },
  } = config;
  // find all apps that are APPROVED with an expiry date that is the configured daysToExpiry2 in the future
  // default is 2 years less 45 days to match DACO
  // at this point an app approaching expiry may already be in the renewal flow, so we still limit query by APPROVED state, which indicates no action has been taken by the applicant
  // query uses expiresAtUtc, because this date may be custom (not matching the configured access period of 2 years)
  const expiryStartDate = moment(currentDate).add(daysToExpiry2, NOTIFICATION_UNIT_OF_TIME);
  const expiryDayRange = getDayRange(expiryStartDate);
  logger.info(
    `${JOB_NAME} - Expiry day period is ${expiryDayRange.$gte} to ${expiryDayRange.$lte}`,
  );
  const query: FilterQuery<ApplicationDocument> = {
    state: 'APPROVED',
    expiresAtUtc: expiryDayRange,
  };

  return query;
};

export default secondExpiryNotificationCheck;
