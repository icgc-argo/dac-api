// sample queries for each job run on a particular date
// to show how the date ranges would line up

// from 2022-12-21
const queries = {
  'attestation query': {
    state: 'APPROVED',
    approvedAtUtc: {
      $gte: '2021-12-21T00:00:00.000Z',
      $lte: '2022-02-04T23:59:59.999Z',
    },
    attestedAtUtc: { $exists: false },
    'emailNotifications.attestationRequiredNotificationSent': { $exists: false },
  },
  'pause query': {
    state: { $in: ['APPROVED', 'PAUSED'] },
    approvedAtUtc: { $lt: '2021-12-21T00:00:00.000Z' },
    expiresAtUtc: { $gt: '2022-12-21T23:59:59.999Z ' },
    // '$or': [ { attestedAtUtc: [Object] }, { attestedAtUtc: [Object] } ],
    'emailNotifications.applicationPausedNotificationSent': { $exists: false },
  },
  'expiry 1': {
    state: { $in: ['APPROVED', 'PAUSED'] },
    expiresAtUtc: { $lte: '2023-03-21T23:59:59.999Z', $gt: '2023-02-04T00:00:00.000Z' },
    'emailNotifications.firstExpiryNotificationSent': { $exists: false },
  },
  'expiry 2': {
    state: { $in: ['APPROVED', 'PAUSED'] },
    expiresAtUtc: { $gt: '2022-12-21T23:59:59.999Z', $lte: '2023-02-04T00:00:00.000Z' },
    'emailNotifications.secondExpiryNotificationSent': { $exists: false },
  },
  expiring: {
    state: { $in: ['APPROVED', 'PAUSED', 'EXPIRED'] },
    expiresAtUtc: { $lt: '2022-12-21T00:00:00.000Z', $gte: '2022-09-22T00:00:00.000Z' },
  },
  closing: {
    state: { $in: ['APPROVED', 'PAUSED', 'EXPIRED'] },
    expiresAtUtc: { $lt: '2022-09-22T00:00:00.000Z' },
  },
};
