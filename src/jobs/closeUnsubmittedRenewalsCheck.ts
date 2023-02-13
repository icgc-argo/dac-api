import moment from 'moment';
import { FilterQuery } from 'mongoose';
import { Identity } from '@overture-stack/ego-token-middleware';
import { chunk } from 'lodash';

import logger from '../logger';
import { ApplicationModel, ApplicationDocument } from '../domain/model';
import { Application } from '../domain/interface';
import { ApplicationStateManager } from '../domain/state';
import { getDacoRole } from '../utils/permissions';
import { REQUEST_CHUNK_SIZE } from '../utils/constants';
import { buildReportDetails, getEmptyReportDetails } from './utils';
import { BatchJobDetails, JobReport, JobResultForApplication } from './types';

const JOB_NAME = 'CLOSING UNSUBMITTED RENEWALS';
/**
 * ```
 * Batch job to find all renewal applications that have reached their renewal period end date (source app's expiry date + DAYS_POST_EXPIRY) and have not been submitted for REVIEW
 * Returns a BatchJobReport with details on appIds retrieved, report start and end time, job success status, and any errors encountered
 * Query will check for any renewalPeriodEndDateUtc value that is before the beginning of the day, to account for days where the batch job run may have been missed
 * ```
 * @param currentDate
 * @param user
 * @returns BatchJobReport
 * @example
 * // returns {
 *  "jobName":"CLOSING UNSUBMITTED RENEWALS",
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
async function runCloseUnsubmittedRenewalsCheck(
  currentDate: Date,
  user: Identity,
): Promise<JobReport<BatchJobDetails>> {
  const jobStartTime = new Date();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    const details = await getClosedAppsReportDetails(user, currentDate);
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

// update app state, including transition to CLOSED + update event
const closeApplication = async (
  currentApp: Application,
  identity: Identity,
): Promise<Application> => {
  const appObj = new ApplicationStateManager(currentApp);
  const role = getDacoRole(identity);
  logger.info(`${JOB_NAME} - Role ${role} is trying to CLOSE appId ${currentApp.appId}.`);
  const result = appObj.updateApp({ state: 'CLOSED' }, false, {
    id: identity.userId,
    role,
  });
  logger.info(`${JOB_NAME} - Updating ${result.appId} in db to ${result.state}.`);
  const updatedApp = await ApplicationModel.findOneAndUpdate({ appId: result.appId }, result, {
    new: true,
  }).exec();
  if (updatedApp) {
    return updatedApp;
  } else {
    throw new Error(`${JOB_NAME} - Find and update operation failed for ${currentApp.appId}.`);
  }
};

export const getAppsClosingQuery = (currentDate: Date): FilterQuery<ApplicationDocument> => {
  const referenceDate = moment(currentDate).utc().startOf('day');
  const query: FilterQuery<ApplicationDocument> = {
    state: {
      $in: ['DRAFT', 'SIGN AND SUBMIT', 'REVISIONS REQUESTED'],
    },
    renewalPeriodEndDateUtc: { $lt: moment(referenceDate).startOf('day').toDate() },
    isRenewal: true,
  };
  return query;
};

const doCloseApplication = async (
  app: ApplicationDocument,
  user: Identity,
): Promise<JobResultForApplication> => {
  try {
    const updatedAppObj = await closeApplication(app, user);
    if (updatedAppObj.state === 'CLOSED') {
      return { success: true, app: updatedAppObj };
    } else {
      // State change failed
      logger.error(
        `${JOB_NAME} - Failed to transition ${updatedAppObj.appId} from ${app.state} to CLOSED state.`,
      );
      return {
        success: false,
        app: updatedAppObj,
        message: `Failed to transition ${updatedAppObj.appId} from ${app.state} to CLOSED state.`,
      };
    }
  } catch (err: unknown) {
    // Error thrown in one of our async operations
    logger.error(`${JOB_NAME} - Error caught while closing application ${app.appId} - ${err}`);
    return { success: false, app, message: `${err}` };
  }
};

const getClosedAppsReportDetails = async (
  user: Identity,
  currentDate: Date,
): Promise<BatchJobDetails> => {
  const query = getAppsClosingQuery(currentDate);
  const closableAppCount = await ApplicationModel.find(query).countDocuments();
  // if no applications fit the criteria, return empty report details
  if (closableAppCount === 0) {
    logger.info(`${JOB_NAME} - No renewal applications need to be closed at this time.`);
    logger.info(`${JOB_NAME} - Generating report.`);
    return getEmptyReportDetails();
  }
  logger.info(`${JOB_NAME} - There are ${closableAppCount} apps that should be CLOSED.`);
  const closableApps = await ApplicationModel.find(query).exec();

  const results: JobResultForApplication[][] = [];
  const chunks = chunk(closableApps, REQUEST_CHUNK_SIZE);
  for (const chunk of chunks) {
    const result = await Promise.all(chunk.map((app) => doCloseApplication(app, user)));
    results.push(result);
  }

  const allResults = results.flat();
  logger.info(`${JOB_NAME} - Generating report details.`);
  const details: BatchJobDetails = buildReportDetails(allResults, 'closedApps', JOB_NAME);
  return details;
};

export default runCloseUnsubmittedRenewalsCheck;
