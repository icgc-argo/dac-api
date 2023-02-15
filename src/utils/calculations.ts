import moment from 'moment';
import { AppConfig, getAppConfig } from '../config';
import { Application, State } from '../domain/interface';

export const sortByDate = (a: any, b: any) => {
  return b.date.getTime() - a.date.getTime();
};

export const getAttestationByDate: (approvalDate: Date) => Date = (approvalDate) => {
  const config = getAppConfig();
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

export const isAttestable: (currentApp: Application) => boolean = (currentApp) => {
  // isAttestable is false if attestation has already occurred
  // **NOTE** attestation fields will be reset when an app goes through the renewal process
  if (currentApp.attestedAtUtc) {
    return false;
  }
  // if app state is neither APPROVED nor PAUSED, attestation doesn't apply so isAttestable cannot be true
  if (!(currentApp.state === 'APPROVED' || currentApp.state === 'PAUSED')) {
    return false;
  }
  const config = getAppConfig();
  const attestationByDate = getAttestationByDate(currentApp.approvedAtUtc);
  const now = moment.utc().toDate();
  const elapsed = getDaysElapsed(now, attestationByDate);
  return elapsed >= -config.durations.attestation.daysToAttestation;
};

export const isRenewable = (currentApp: Application): boolean => {
  // can only renew an app in these states
  if (!['APPROVED', 'EXPIRED', 'PAUSED'].includes(currentApp.state)) {
    return false;
  }
  // can only create one renewal application per source application
  if (currentApp.renewalAppId) {
    return false;
  }

  // must have expiresAtUtc value to check renewal period eligibility
  if (!currentApp.expiresAtUtc) {
    return false;
  }
  const config = getAppConfig();
  const now = moment.utc();
  // need to calculate renewability relative to expiry date, because this date may be custom (not matching the configured access period)
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

  // can only renew if the expiry falls between DAYS_TO_EXPIRY_1 days prior to today and DAYS_POST_EXPIRY after
  return now.isBetween(expiryPeriodStart, expiryPeriodEnd);
};

export const renewalPeriodIsEnded = (currentApp: Application): boolean => {
  const today = moment.utc().startOf('day');
  return (
    !!currentApp.renewalPeriodEndDateUtc &&
    moment(currentApp?.renewalPeriodEndDateUtc).isBefore(today)
  );
};

export const isExpirable: (currentApp: Application) => boolean = (currentApp) => {
  if (!['APPROVED', 'PAUSED'].includes(currentApp.state)) {
    return false;
  }
  const today = moment.utc().endOf('day');
  return moment.utc(currentApp.expiresAtUtc).isBefore(today);
};

export const isInPreSubmittedState = (currentApp: Application): boolean => {
  const preSubmittedStates: State[] = ['DRAFT', 'SIGN AND SUBMIT', 'REVISIONS REQUESTED'];
  return preSubmittedStates.includes(currentApp.state);
};
