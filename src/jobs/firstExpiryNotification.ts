import moment from 'moment';
import { FilterQuery } from 'mongoose';

import { ApplicationDocument } from '../domain/model';
import { AppConfig } from '../config';
import { NOTIFICATION_UNIT_OF_TIME } from '../utils/constants';

const JOB_NAME = 'FIRST EXPIRY NOTIFICATIONS';
// 1st notification for applications entering renewal period (DAYS_TO_EXPIRY_1)
export default async function () {
  // TODO: implement
  return;
}

const getFirstExpiryQuery = (
  config: AppConfig,
  currentDate: Date,
): FilterQuery<ApplicationDocument> => {
  const referenceDate = moment(currentDate).utc();
  const {
    durations: {
      expiry: { daysToExpiry1, daysToExpiry2 },
    },
  } = config;
  // is expiry between 90 days to 45 days in the future
  const upperThreshold = moment(referenceDate)
    .add(daysToExpiry1, NOTIFICATION_UNIT_OF_TIME)
    .endOf('day')
    .toDate();
  const lowerThreshold = moment(referenceDate)
    .add(daysToExpiry2, NOTIFICATION_UNIT_OF_TIME)
    .startOf('day')
    .toDate();
  const query: FilterQuery<ApplicationDocument> = {
    state: {
      $in: ['APPROVED', 'PAUSED'],
    },
    expiresAtUtc: {
      $lte: upperThreshold,
      $gte: lowerThreshold,
    },
    'emailNotifications.firstExpiryNotificationSent': { $exists: false },
  };

  return query;
};
