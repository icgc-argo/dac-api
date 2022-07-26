import { Application } from '../domain/interface';
import logger from '../logger';
import { Report, ReportItem } from './types';

export const getEmptyReport: () => ReportItem = () => ({
  count: 0,
  ids: [],
  errors: [],
  errorCount: 0,
});

export const buildReportItem = (
  results: PromiseSettledResult<any>[],
  reportType: keyof Report,
  jobName: string,
) => {
  logger.info(`${jobName} - Building report item for [${reportType}].`);
  logger.info(`${jobName} - Adding successful requests to [${reportType}] report.`);
  const resolved = results
    .filter((res) => res.status === 'fulfilled')
    .map((success) => {
      const { value } = success as PromiseFulfilledResult<Application>;
      logger.info(`${jobName} - Notification succeeded for ${value.appId}`);
      return value.appId;
    });
  logger.info(`${jobName} - Adding failed requests to [${reportType}] report.`);
  const rejected = results
    .filter((res) => res.status === 'rejected')
    .map((rej) => {
      const { reason } = rej as PromiseRejectedResult;
      // TODO: is there a way to guarantee appObj/appId can be returned in the error?
      logger.warn(`${jobName} - Notification failed: ${reason}`);
      return reason.toString();
    });

  logger.info(`${jobName} - Processed request results, returning [${reportType}] report.`);
  return {
    ids: resolved,
    count: resolved.length,
    errors: rejected,
    errorCount: rejected.length,
  } as ReportItem;
};
