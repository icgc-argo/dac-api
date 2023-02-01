// sample queries for each job run on a particular date to show how the date ranges would line up

// Jan.7 2023
// with DACO default durations

// DAYS_TO_EXPIRY_1=90
// DAYS_TO_EXPIRY_2=45
// DAYS_POST_EXPIRY=90
// EXPIRY_UNIT_COUNT=2
// EXPIRY_UNIT_OF_TIME=years

// ATTESTATION_UNIT_COUNT=1
// ATTESTATION_UNIT_OF_TIME=year
// DAYS_TO_ATTESTATION=45

const examples = {
  attestation: {
    state: 'APPROVED',
    approvedAtUtc: { $gte: '2022-01-07T00:00:00.000Z', $lte: '2022-02-21T23:59:59.999Z' },
    expiresAtUtc: { $gt: '2023-01-07T23:59:59.999Z' },
    attestedAtUtc: { $exists: false },
    'emailNotifications.attestationRequiredNotificationSent': { $exists: false },
  },
  pausing: {
    state: { $in: ['APPROVED', 'PAUSED'] },
    approvedAtUtc: { $lt: '2022-01-07T00:00:00.000Z' },
    expiresAtUtc: { $gt: '2023-01-07T23:59:59.999Z' },
    attestedAtUtc: { $exists: false },
    'emailNotifications.applicationPausedNotificationSent': { $exists: false },
  },
  expiry1: {
    state: { $in: ['APPROVED', 'PAUSED'] },
    expiresAtUtc: {
      $lte: '2023-04-07T23:59:59.999Z',
      $gte: '2023-02-21T00:00:00.000Z',
    },
    'emailNotifications.firstExpiryNotificationSent': { $exists: false },
  },
  expiry2: {
    state: { $in: ['APPROVED', 'PAUSED'] },
    expiresAtUtc: {
      $gt: '2023-01-07T23:59:59.999Z',
      $lt: '2023-02-21T00:00:00.000Z',
    },
    'emailNotifications.secondExpiryNotificationSent': { $exists: false },
  },
  expiring: {
    state: { $in: ['APPROVED', 'PAUSED', 'EXPIRED'] },
    expiresAtUtc: {
      $lte: '2023-01-07T23:59:59.999Z',
    },
    'emailNotifications.applicationExpiredNotificationSent': { $exists: false },
  },
  closing: {
    state: { $in: ['APPROVED', 'PAUSED', 'EXPIRED'] },
    expiresAtUtc: { $lt: '2022-10-09T00:00:00.000Z' },
    'emailNotifications.applicationClosedNotificationSent': { $exists: false },
  },
};
