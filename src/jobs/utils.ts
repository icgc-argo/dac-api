import { NotificationSentFlags, Application } from '../domain/interface';
import { ApplicationModel } from '../domain/model';
import { ApplicationStateManager } from '../domain/state';
import logger from '../logger';
import {
  Report,
  BatchJobDetails,
  JobResultForApplication,
  JobErrorResultForApplication,
} from './types';

export const getEmptyReportDetails: () => BatchJobDetails = () => ({
  count: 0,
  ids: [],
  errors: [],
  errorCount: 0,
});

// filter func to ensure errors list is of type JobErrorResultForApplication
const jobErrorFilter = (inputs: JobResultForApplication[]): JobErrorResultForApplication[] => {
  const outputs: JobErrorResultForApplication[] = [];
  inputs.forEach((input) => {
    if (!input.success) {
      outputs.push(input);
    }
  });
  return outputs;
};

export const buildReportDetails = (
  results: JobResultForApplication[],
  reportType: keyof Report,
  jobName: string,
): BatchJobDetails => {
  logger.info(`${jobName} - Building report item for [${reportType}].`);
  const ids = results.map((result) => result.app.appId);
  const count = ids.length;
  const failedResults = jobErrorFilter(results).map((error) => ({
    id: error.app.appId,
    message: error.message,
  }));
  logger.info(`${jobName} - Processed request results, returning [${reportType}] report.`);
  const details: BatchJobDetails = {
    ids,
    count,
    errors: failedResults,
    errorCount: failedResults.length,
  };
  return details;
};

export async function setEmailSentFlag(
  app: Application,
  flag: keyof NotificationSentFlags,
  jobName: string,
): Promise<Application> {
  const appObj = new ApplicationStateManager(app);
  const notificationFieldName = `emailNotifications.${flag}`;
  logger.info(`${jobName} - Email sent, setting ${notificationFieldName} flag.`);
  const result = appObj.updateEmailNotifications(flag);
  // save new app state in db
  const updatedApp = await ApplicationModel.findOneAndUpdate({ appId: result.appId }, result, {
    new: true,
  }).exec();
  if (updatedApp) {
    logger.info(`${jobName} - ${notificationFieldName} flag set to TRUE`);
    return updatedApp;
  } else {
    throw new Error(`${jobName} - Find and update operation failed for ${app.appId}.`);
  }
}
