import moment, { unitOfTime } from 'moment';
import { AppConfig } from '../config';
import { Application } from '../domain/interface';

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
  // create new moment values so currentDate is not mutated
  // convert to start of day to ignore the time when calculating the diff: https://stackoverflow.com/a/9130040
  const begin = moment.utc(baseDate).startOf('day');
  const end = moment.utc(dateToDiff).startOf('day');
  const daysElapsed = begin.diff(end, 'days');
  return daysElapsed;
};

export const isAttestable: (currentApp: Application, config: AppConfig) => boolean = (
  currentApp,
  config,
) => {
  // isAttestable is false if attestation has already occurred
  // **NOTE** attestation fields will be reset when an app goes through the renewal process
  if (currentApp.attestedAtUtc) {
    return false;
  }
  // if app state is neither APPROVED nor PAUSED, attestation doesn't apply so isAttestable cannot be true
  if (!(currentApp.state === 'APPROVED' || currentApp.state === 'PAUSED')) {
    return false;
  }
  const attestationByDate = getAttestationByDate(currentApp.approvedAtUtc, config);
  const now = moment.utc().toDate();
  const elapsed = getDaysElapsed(now, attestationByDate);
  return elapsed >= -config.durations.attestation.daysToAttestation;
};
