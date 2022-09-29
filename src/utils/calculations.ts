import moment from 'moment';
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
  return moment(approvalDate).add(count, unitOfTime).toDate();
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
('');
export const isRenewable: (currentApp: Application, config: AppConfig) => boolean = (
  currentApp,
  config,
) => {
  // if the user has already started the renewal process, app state will be in DRAFT, SIGN AND SUBMIT, REVIEW or REVISIONS REQUESTED,
  // so need to look for apps still in APPROVED or EXPIRED state, which means no action has been taken yet
  // TODO: verify whether PAUSED apps can be renewed
  if (!(currentApp.expiresAtUtc && ['APPROVED', 'EXPIRED'].includes(currentApp.state))) {
    return false;
  }
  const now = moment.utc();
  // expiry - DAYS_TO_EXPIRY_1
  const expiryPeriodStart = moment
    .utc(currentApp.expiresAtUtc)
    .startOf('day')
    .subtract(config.durations.expiry.daysToExpiry1, 'days');

  // expiry + DAYS_POST_EXPIRY
  const expiryPeriodEnd = moment
    .utc(currentApp.expiresAtUtc)
    .endOf('day')
    .add(config.durations.expiry.daysPostExpiry, 'days');

  // between DAYS_TO_EXPIRY_1 days prior to today and DAYS_POST_EXPIRY after
  return now.isBetween(expiryPeriodStart, expiryPeriodEnd);
};
