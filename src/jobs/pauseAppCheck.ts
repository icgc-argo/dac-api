import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import moment from 'moment';
import { FilterQuery } from 'mongoose';
import { Identity } from '@overture-stack/ego-token-middleware';
import { chunk } from 'lodash';

import logger from '../logger';
import { AppConfig, getAppConfig } from '../config';
import { ApplicationModel, ApplicationDocument } from '../domain/model';
import { Application, PauseReason } from '../domain/interface';
import { ApplicationStateManager } from '../domain/state';
import { getDacoRole } from '../utils/permissions';
import { REQUEST_CHUNK_SIZE } from '../utils/constants';
import { onStateChange } from '../domain/service/applications';
import { buildReportDetails, getEmptyReportDetails, setEmailSentFlag } from './utils';
import { BatchJobDetails, JobReport, JobResultForApplication } from './types';

export const JOB_NAME = 'PAUSING APPLICATIONS';

// Job to check for applications that have reached attestationBy date and are not attested
// These will be PAUSED and notifications sent
async function runPauseAppsCheck(
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  user: Identity,
): Promise<JobReport<BatchJobDetails>> {
  const jobStartTime = new Date();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    const details = await pauseAppsAndGetReportDetails(emailClient, user, currentDate);
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

const searchPauseableApplications = async (
  query: FilterQuery<ApplicationDocument>,
): Promise<ApplicationDocument[]> => {
  // can still run this multiple times in the same 24hr period,
  // as any apps that were paused previously will be ignored because we're looking for APPROVED state
  const apps = await ApplicationModel.find(query).exec();
  return apps;
};

// update app state, including transition to paused + update event
const pauseApplication = async (
  currentApp: Application,
  identity: Identity,
  reason?: PauseReason,
): Promise<Application> => {
  // set app in state
  const appObj = new ApplicationStateManager(currentApp);
  const role = getDacoRole(identity);
  logger.info(
    `${JOB_NAME} - Role ${role} is trying to PAUSE appId ${currentApp.appId} with pause reason ${reason}`,
  );
  const result = appObj.updateApp({ state: 'PAUSED', pauseReason: reason }, false, {
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

const getPauseableQuery = (
  config: AppConfig,
  currentDate: Date,
): FilterQuery<ApplicationDocument> => {
  const {
    durations: {
      attestation: { count, unitOfTime },
    },
  } = config;
  // find all apps that are APPROVED with an approval date matching the configured time period, check vs the start of the day this check is run
  const referenceDate = moment(currentDate).utc();
  // default is 1 year to match DACO
  const approvalThreshold = moment(referenceDate)
    .subtract(count, unitOfTime)
    .startOf('day')
    .toDate();
  const expiryThreshold = moment(referenceDate).endOf('day').toDate();

  logger.info(`${JOB_NAME} - [approvedAtUtc] date threshold is ${approvalThreshold}`);
  logger.info(`${JOB_NAME} - [expiresAtUtc] date threshold is ${expiryThreshold}.`);

  const query: FilterQuery<ApplicationDocument> = {
    state: { $in: ['APPROVED', 'PAUSED'] },
    approvedAtUtc: {
      // filter for any time period equal to or past attestationByUtc in case an application that should have been paused previously
      // is caught on a subsequent job run, as it will still be APPROVED or PAUSED and not have an attestedAtUtc value
      $lt: approvalThreshold,
    },
    expiresAtUtc: {
      $gt: expiryThreshold,
    },
    attestedAtUtc: { $exists: false },
    'emailNotifications.applicationPausedNotificationSent': { $exists: false },
  };

  return query;
};

const doPauseApplication = async (
  app: ApplicationDocument,
  user: Identity,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
): Promise<JobResultForApplication> => {
  try {
    // check if already PAUSED so operation is not repeated, as the query may catch already paused apps that are missing the email flag
    const updatedAppObj =
      app.state === 'PAUSED'
        ? app
        : await pauseApplication(app, user, PauseReason.PENDING_ATTESTATION);
    if (updatedAppObj.state === 'PAUSED') {
      if (app.state === 'PAUSED') {
        logger.info(
          `${JOB_NAME} - Application ${app.appId} is already in paused state, but email failed to send on previous run. Retrying.`,
        );
      }
      // send required emails
      await onStateChange(updatedAppObj, app, emailClient, config);
      // setting email notification here, not in onStateChange, because this flag is set on batch jobs only (not custom cases like an admin pause)
      const appWithFlagSet = await setEmailSentFlag(
        updatedAppObj,
        'applicationPausedNotificationSent',
        JOB_NAME,
      );
      return { success: true, app: appWithFlagSet };
    } else {
      // State change failed
      logger.error(
        `${JOB_NAME} - Failed to transition ${updatedAppObj.appId} from ${app.state} to PAUSED state.`,
      );
      return {
        success: false,
        app: updatedAppObj,
        message: `Failed to transition ${updatedAppObj.appId} from ${app.state} to PAUSED state.`,
      };
    }
  } catch (err: unknown) {
    // Error thrown in one of our async operations
    logger.error(`${JOB_NAME} - Error caught while pausing application ${app.appId} - ${err}`);
    return { success: false, app, message: `${err}` };
  }
};

const pauseAppsAndGetReportDetails = async (
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  user: Identity,
  currentDate: Date,
): Promise<BatchJobDetails> => {
  const config = getAppConfig();
  const query = getPauseableQuery(config, currentDate);
  const pauseableAppCount = await ApplicationModel.find(query).countDocuments();
  // if no applications fit the criteria, return empty report details
  if (pauseableAppCount === 0) {
    logger.info(`${JOB_NAME} - No applications need to be paused at this time.`);
    logger.info(`${JOB_NAME} - Generating report.`);
    return getEmptyReportDetails();
  }
  logger.info(`${JOB_NAME} - There are ${pauseableAppCount} apps that should be PAUSED.`);
  const pauseableApps = await searchPauseableApplications(query);

  const results: JobResultForApplication[][] = [];
  const chunks = chunk(pauseableApps, REQUEST_CHUNK_SIZE);
  for (const chunk of chunks) {
    const result = await Promise.all(
      chunk.map((app) => doPauseApplication(app, user, emailClient, config)),
    );
    results.push(result);
  }

  const allResults = results.flat();
  logger.info(`${JOB_NAME} - Generating report details.`);
  const details: BatchJobDetails = buildReportDetails(allResults, 'pausedApps', JOB_NAME);
  return details;
};

export default runPauseAppsCheck;
