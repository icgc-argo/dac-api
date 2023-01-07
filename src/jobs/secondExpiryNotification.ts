import moment from 'moment';
import { FilterQuery } from 'mongoose';

import { ApplicationDocument } from '../domain/model';
import { AppConfig } from '../config';
import { NOTIFICATION_UNIT_OF_TIME } from '../utils/constants';

const JOB_NAME = 'SECOND EXPIRY NOTIFICATIONS';

// 2nd notification for applications that have not begun renewal process (DAYS_TO_EXPIRY_2)
export default async function () {
  // TODO: implement
  return;
}

const getSecondExpiryQuery = (
  config: AppConfig,
  currentDate: Date,
): FilterQuery<ApplicationDocument> => {
  const referenceDate = moment(currentDate).utc();
  const {
    durations: {
      expiry: { daysToExpiry2 },
    },
  } = config;
  // is expiry between 45 days in the future and today
  const upperThreshold = moment(referenceDate)
    .add(daysToExpiry2, NOTIFICATION_UNIT_OF_TIME)
    .startOf('day')
    .toDate();

  const lowerThreshold = moment(referenceDate).endOf('day').toDate();
  const query: FilterQuery<ApplicationDocument> = {
    state: {
      $in: ['APPROVED', 'PAUSED'],
    },
    expiresAtUtc: {
      $gt: lowerThreshold,
      $lt: upperThreshold,
    },
    'emailNotifications.secondExpiryNotificationSent': { $exists: false },
  };

  return query;
};
