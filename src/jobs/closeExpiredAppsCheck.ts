import moment from 'moment';
import { FilterQuery } from 'mongoose';

import { ApplicationDocument } from '../domain/model';
import { AppConfig } from '../config';
import { NOTIFICATION_UNIT_OF_TIME } from '../utils/constants';

const JOB_NAME = 'CLOSING EXPIRED APPLICATIONS';

// Check for applications that have reached expiry date + DAYS_POST_EXPIRY
// if they are not already in REVIEW state, they will transition to CLOSED
export default async function () {
  // TODO: implement
  return;
}

const getAppClosingingQuery = (
  config: AppConfig,
  currentDate: Date,
): FilterQuery<ApplicationDocument> => {
  const referenceDate = moment(currentDate).utc().startOf('day');
  const {
    durations: {
      expiry: { daysPostExpiry },
    },
  } = config;
  // is expiry more than 90 days ago
  const expiryThreshold = moment(referenceDate)
    .subtract(daysPostExpiry, NOTIFICATION_UNIT_OF_TIME)
    .toDate();

  const query: FilterQuery<ApplicationDocument> = {
    state: {
      $in: ['APPROVED', 'PAUSED', 'EXPIRED'],
    },
    expiresAtUtc: {
      $lt: expiryThreshold,
    },
    'emailNotifications.applicationClosedNotificationSent': { $exists: false },
  };

  return query;
};
