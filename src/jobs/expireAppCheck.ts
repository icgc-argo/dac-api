import moment from 'moment';
import { FilterQuery } from 'mongoose';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Identity } from '@overture-stack/ego-token-middleware';
import { chunk } from 'lodash';

import logger from '../logger';
import { AppConfig, getAppConfig } from '../config';
import { ApplicationModel, ApplicationDocument } from '../domain/model';
import { Application } from '../domain/interface';
import { ApplicationStateManager } from '../domain/state';
import { getDacoRole } from '../utils/permissions';
import { REQUEST_CHUNK_SIZE } from '../utils/constants';
import { onStateChange } from '../domain/service/applications';
import { buildReportDetails, getEmptyReportDetails, setEmailSentFlag } from './utils';
import { BatchJobDetails, JobReport, JobResultForApplication } from './types';
import { NOTIFICATION_UNIT_OF_TIME } from '../utils/constants';

const JOB_NAME = 'EXPIRING APPLICATIONS';
/**
 * ```
 * Batch job to find all applications that have reached expiry date (expiresAtUtc), transition to EXPIRED state and notify applicants via email
 * Returns a BatchJobReport with details on appIds retrieved, report start and end time, job success status, and any errors encountered
 * Query uses a date range (expiresAtUtc to DAYS_POST_EXPIRY) to account for days where the batch job run may have been missed
 * Sets a flag on the app, applicationExpiredNotificationSent, to indicate an email has been sent and application can be ignored on a subsequent run
 * ```
 * @param currentDate
 * @param emailClient
 * @returns BatchJobReport
 * @example
 * // returns {
 *  "jobName":"EXPIRING APPLICATIONS",
 *  "startedAt":"2023-02-01T08:00:04.817Z",
 *  "finishedAt":"2023-02-01T08:00:05.394Z",
 *  "success":true,
 *  "details":{
 *    "ids":[],
 *    "count":0,
 *    "errors":[],
 *    "errorCount":0
 *   }
 * }
 */
async function runExpiringAppsCheck(
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  user: Identity,
): Promise<JobReport<BatchJobDetails>> {
  const jobStartTime = new Date();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    const details = await getExpiredAppsReportDetails(emailClient, user, currentDate);
    details.errors.length
      ? logger.warn(`${JOB_NAME} - Completed with errors.`)
      : logger.info(`${JOB_NAME} - Completed.`);
    const endTime = new Date();
    const jobSuccessReport: JobReport<BatchJobDetails> = {
      jobName: JOB_NAME,
      startedAt: jobStartTime,
      finishedAt: endTime,
      success: true,
      details,
    };
    logger.info(`${JOB_NAME} - Report: ${JSON.stringify(jobSuccessReport)}`);
    return jobSuccessReport;
  } catch (err) {
    logger.error(`${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`);
    const jobEndTime = new Date();
    const jobFailedReport: JobReport<BatchJobDetails> = {
      jobName: JOB_NAME,
      startedAt: jobStartTime,
      finishedAt: jobEndTime,
      success: false,
      error: `${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`,
    };
    logger.error(`${JOB_NAME} - Report: ${JSON.stringify(jobFailedReport)}`);
    return jobFailedReport;
  }
}

const expireApplication = async (
  currentApp: Application,
  identity: Identity,
): Promise<Application> => {
  // set app in state
  const appObj = new ApplicationStateManager(currentApp);
  const role = getDacoRole(identity);
  logger.info(`${JOB_NAME} - Role ${role} is trying to EXPIRE appId ${currentApp.appId}.`);
  const result = appObj.updateApp({ state: 'EXPIRED' }, false, {
    id: identity.userId,
    role,
  });
  logger.info(`${JOB_NAME} - Updating ${result.appId} in db to ${result.state}.`);
  // save new app state in db
  const updatedApp = await ApplicationModel.findOneAndUpdate({ appId: result.appId }, result, {
    new: true,
  }).exec();
  if (updatedApp) {
    return updatedApp;
  } else {
    throw new Error(`${JOB_NAME} - Find and update operation failed for ${currentApp.appId}.`);
  }
};

const getExpiredAppsReportDetails = async (
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  user: Identity,
  currentDate: Date,
): Promise<BatchJobDetails> => {
  const config = getAppConfig();
  const query = getAppExpiringQuery(config, currentDate);
  const expiringAppCount = await ApplicationModel.find(query).countDocuments();
  // if no applications fit the criteria, return empty report details
  if (expiringAppCount === 0) {
    logger.info(`${JOB_NAME} - No applications need to be EXPIRED at this time.`);
    logger.info(`${JOB_NAME} - Generating report.`);
    return getEmptyReportDetails();
  }
  logger.info(`${JOB_NAME} - There are ${expiringAppCount} apps that should be EXPIRED.`);
  const expiringApps = await ApplicationModel.find(query).exec();

  const doExpireApplication = async (
    app: ApplicationDocument,
  ): Promise<JobResultForApplication> => {
    try {
      // check if already EXPIRED so operation is not repeated, as the query may catch already expired apps that are missing the email flag
      const updatedAppObj = app.state === 'EXPIRED' ? app : await expireApplication(app, user);
      if (updatedAppObj.state === 'EXPIRED') {
        if (app.state === 'EXPIRED') {
          logger.info(
            `${JOB_NAME} - Application ${app.appId} is already in EXPIRED state, but email failed to send on previous run. Retrying.`,
          );
        }
        // send required emails
        await onStateChange(updatedAppObj, app, emailClient, config);
        // setting email notification here, not in onStateChange, because this flag is set on batch jobs only
        const appWithFlagSet = await setEmailSentFlag(
          updatedAppObj,
          'applicationExpiredNotificationSent',
          JOB_NAME,
        );
        return { success: true, app: appWithFlagSet };
      } else {
        // State change failed
        logger.error(
          `${JOB_NAME} - Failed to transition ${updatedAppObj.appId} from ${app.state} to EXPIRED state.`,
        );
        return {
          success: false,
          app: updatedAppObj,
          message: `Failed to transition ${updatedAppObj.appId} from ${app.state} to EXPIRED state.`,
        };
      }
    } catch (err: unknown) {
      // Error thrown in one of our async operations
      logger.error(`${JOB_NAME} - Error caught while expiring application ${app.appId} - ${err}`);
      return { success: false, app, message: `${err}` };
    }
  };

  const results: JobResultForApplication[][] = [];
  const chunks = chunk(expiringApps, REQUEST_CHUNK_SIZE);
  for (const chunk of chunks) {
    const result = await Promise.all(chunk.map(doExpireApplication));
    results.push(result);
  }

  const allResults = results.flat();
  logger.info(`${JOB_NAME} - Generating report details.`);
  const details: BatchJobDetails = buildReportDetails(allResults, 'expiredApps', JOB_NAME);
  return details;
};

const getAppExpiringQuery = (
  config: AppConfig,
  currentDate: Date,
): FilterQuery<ApplicationDocument> => {
  const referenceDate = moment(currentDate).utc();
  const {
    durations: {
      expiry: { daysPostExpiry },
    },
  } = config;
  // is expiry between today and 90 days ago
  const upperThreshold = moment(referenceDate).endOf('day').toDate();
  const lowerThreshold = moment(referenceDate)
    .startOf('day')
    .subtract(daysPostExpiry, NOTIFICATION_UNIT_OF_TIME)
    .toDate();

  const query: FilterQuery<ApplicationDocument> = {
    state: {
      $in: ['APPROVED', 'PAUSED', 'EXPIRED'],
    },
    expiresAtUtc: {
      $lte: upperThreshold,
      $gte: lowerThreshold,
    },
    'emailNotifications.applicationExpiredNotificationSent': { $exists: false },
  };

  return query;
};

export default runExpiringAppsCheck;
