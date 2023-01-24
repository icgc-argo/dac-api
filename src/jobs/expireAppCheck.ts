import moment from 'moment';
import { FilterQuery } from 'mongoose';

import { ApplicationDocument } from '../domain/model';
import { AppConfig } from '../config';
import { NOTIFICATION_UNIT_OF_TIME } from '../utils/constants';

const JOB_NAME = 'EXPIRING APPLICATIONS';
// Check for applications that have reached expiry date and have not begun renewal process
// this will transition applications to EXPIRED and expiry notifications sent
export default async function () {
  // TODO: implement
  return;
}

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
  const lowerThreshold = moment(referenceDate).endOf('day');
  const range2 = moment(referenceDate)
    .startOf('day')
    .subtract(daysPostExpiry, NOTIFICATION_UNIT_OF_TIME)
    .toDate();

  const query: FilterQuery<ApplicationDocument> = {
    state: {
      $in: ['APPROVED', 'PAUSED', 'EXPIRED'],
    },
    expiresAtUtc: {
      $lte: lowerThreshold.toDate(),
      $gte: range2,
    },
    'emailNotifications.applicationExpiredNotificationSent': { $exists: false },
  };

  return query;
};
