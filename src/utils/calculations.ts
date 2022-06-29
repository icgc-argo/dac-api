import moment, { unitOfTime } from 'moment';
import { AppConfig } from '../config';
import { Application } from '../domain/interface';
// import { DAYS_TO_ATTESTATION } from './constants';

export const sortByDate = (a: any, b: any) => {
  return b.date.getTime() - a.date.getTime();
};

export const getAttestationByDate: (approvalDate: Date, config: AppConfig) => Date = (
  approvalDate,
  config,
) => {
  const { unitOfTime, count } = config.durations?.attestation;
  return moment(approvalDate)
    .add(count as number, unitOfTime as unitOfTime.DurationConstructor)
    .toDate();
};

export const getDaysElapsed: (baseDate: Date, dateToDiff: Date) => number = (
  baseDate,
  dateToDiff,
) => {
  const begin = moment.utc(baseDate).startOf('day');
  const end = moment.utc(dateToDiff).startOf('day');
  const daysElapsed = begin.diff(end, 'days');
  return daysElapsed;
};

export const isAttestable: (currentApp: Application, config: AppConfig) => boolean = (
  currentApp,
  config,
) => {
  const attestationByDate = getAttestationByDate(currentApp.approvedAtUtc, config);
  const now = moment.utc().toDate();
  const elapsed = getDaysElapsed(now, attestationByDate);
  return elapsed >= -45;
};
