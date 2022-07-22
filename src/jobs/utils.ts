import { reduce } from 'lodash';
import moment from 'moment';
import { Application } from '../domain/interface';

import logger from '../logger';
import { Report, ReportItem } from './types';

export const getEmptyReport: () => ReportItem = () => ({ count: 0, ids: [], errors: [] });

// const addAppIdToReport = (type: keyof Report, report: Report, appId: string) => {
//   // report[type].count++;
//   report[type].ids.push(appId);
//   return report;
// };

// export const addErrorToReport = (type: keyof Report, report: Report, err: string) => {
//   report[type].errors.push(err);
//   return report;
// };

export const buildReportItem = (results: PromiseSettledResult<any>[], reportType: keyof Report) => {
  logger.info(`Adding successful requests to ${reportType} report.`);
  const resolved = results
    .filter((res) => res.status === 'fulfilled')
    .map((success) => {
      const { value } = success as PromiseFulfilledResult<Application>;
      return value.appId;
    });
  logger.info(`Adding failed requests to ${reportType} report.`);
  const rejected = results
    .filter((res) => res.status === 'rejected')
    .map((rej) => {
      const { reason } = rej as PromiseRejectedResult;
      return reason.toString();
    });

  return {
    ids: resolved,
    count: resolved.length,
    errors: rejected,
  } as ReportItem;
};

// move to calculations util file?
export const getDayRange: (targetDate: moment.Moment) => { $gte: Date; $lte: Date } = (
  targetDate,
) => {
  const start = moment(targetDate).startOf('day').toDate();
  const end = moment(targetDate).endOf('day').toDate();
  return {
    $gte: start,
    $lte: end,
  };
};
