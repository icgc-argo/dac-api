# DACO Batch Jobs

DACO requires several events be triggered throughout the lifecycle of an approved application:

> **Note**: The time values referenced in the descriptions below are DACO defaults; however, these are configurable, see [Environment Variables](#environment-variables)

- Applicants must attest to the Data Access Agreements 1 year after approval
- Applicants who fail to attest after 1 year will have their controlled access paused
- Access expires 2 years after approval, and applicants must renew their original application in order to continue their access to controlled data

In addition, the EGA requires a daily list of users from all approved applications in the system. This job was added as the last in the sequence so that applications are in the most up-to-date state when the list is generated.

There is a cronjob that runs once daily that will trigger these changes, via the `/jobs/batch-transitions/` endpoint. The timing trigger for each one is configurable via env vars (see [Environment Variables](#environment-variables)), but this doc will reference expected DACO default values. A report is logged for each job to track affected applications on a given run, and any errors that occur.

## List of Jobs

The batch jobs are executed sequentially, in this order:

1. [Attestation Required Notifications](#attestation-required-notifications)
2. [Pause Applications](#pause-applications)
3. [First Notification of Application Expiry](#first-notification-of-application-expiry)
4. [Second Notification of Application Expiry](#second-notification-of-application-expiry)
5. [Expire Applications](#expire-applications)
6. [Close Unsubmitted Renewal Applications](#close-unsubmitted-renewal-applications)
7. [Approved Users List](#approved-users-list)

## Job Details

### Attestation Required Notifications

- file: [src/jobs/attestationRequiredNotification.ts](./attestationRequiredNotification.ts)
- Sends an email notification to the applicant and submitter that attestation is required in 45 (`DAYS_TO_ATTESTATION`) days.
- query will retrieve all applications that are:
  - `APPROVED`
  - `approvedAtUtc` value is between 1 year ago to 1 year (`ATTESTATION_UNIT_COUNT` + `ATTESTATION_UNIT_OF_TIME`) less 45 (`DAYS_TO_ATTESTATION`) days ago
  - `attestedAtUtc` value is undefined
  - `emailNotifications.attestationRequiredNotificationSent` is undefined
- no state change occurs on the application
- sets the `emailNotifications.attestationRequiredNotificationSent` to the current date. This flag is to track whether an email has been sent, in the case where a job run is missed or an error occurs in the job run that prevents the email from being sent.

Example Report Result:

```
attestationNotifications: {
   jobName: 'ATTESTATION REQUIRED NOTIFICATIONS',
   startedAt: '2023-04-30T08:00:04.982Z',
   finishedAt: '2023-04-30T08:00:05.333Z',
   success: true,
   details: { ids: ['DACO-388'], count: 1, errors: [], errorCount: 0 },
}
```

### Pause Applications

- file: [src/jobs/pauseAppCheck.ts](./pauseAppCheck.ts)
- Transitions applications that meet the criteria to `PAUSED` state, and sends an email to the applicant and submitter regarding the change
- query will retrieve all applications that are:
  - `APPROVED` or `PAUSED`
  - `approvedAtUtc` value is 1 year (`ATTESTATION_UNIT_COUNT` + `ATTESTATION_UNIT_OF_TIME`) ago or more
  - `expiresAtUtc` is later than the current date
  - `attestedAtUtc` is undefined
  - `emailNotifications.applicationPausedNotificationSent` is undefined
- transitions the application state to `PAUSED` if not already
- adds a `PAUSED` update event to the updates list
- sets the `emailNotifications.applicationPausedNotificationSent` to the current date. This flag is to track whether an email has been sent, in the case where a job run is missed or an error occurs in the job run that prevents the email from being sent. This is also why `PAUSED` is included as a possible state, in the case of the state transition having occurred on an earlier job run, but the email event failed.

Example Report Result:

```
pausedApps: {
    jobName: 'PAUSING APPLICATIONS',
    startedAt: '2023-04-30T08:00:05.333Z',
    finishedAt: '2023-04-30T08:00:05.847Z',
    success: true,
    details: { ids: ['DACO-383', 'DACO-384'], count: 2, errors: [], errorCount: 0 },
}
```

### First Notification of Application Expiry

- file: [src/jobs/firstExpiryNotification.ts](./firstExpiryNotification.ts)
- Sends an email notification to the applicant and submitter that their application will expire in 90 (`DAYS_TO_EXPIRY_1`) days, and they now have the option to renew this existing application to continue their access, and this option will be available up to 90 (`DAYS_POST_EXPIRY`) days past their expiry.
- query will retrieve all applications that are:
  - `APPROVED` or `PAUSED`
  - `expiresAtUtc` is between 90 (`DAYS_TO_EXPIRY_1`) to 45 (`DAYS_TO_EXPIRY_2`) days in the future
  - `emailNotifications.firstExpiryNotificationSent` is undefined
- no state change occurs on the application
- sets the `emailNotifications.firstExpiryNotificationSent` to the current date. This flag is to track whether an email has been sent, in the case where a job run is missed or an error occurs in the job run that prevents the email from being sent.

Example Report Result:

```
expiryNotifications1: {
    jobName: 'FIRST EXPIRY NOTIFICATIONS',
    startedAt: '2023-04-30T08:00:05.848Z',
    finishedAt: '2023-04-30T08:00:05.852Z',
    success: true,
    details: { count: 0, ids: [], errors: [], errorCount: 0 },
}
```

### Second Notification of Application Expiry

- file: [src/jobs/secondExpiryNotification.ts](./secondExpiryNotification.ts)
- Sends an email notification to the applicant and submitter that their application will expire in 45 (`DAYS_TO_EXPIRY_2`) days, and they still have the option to renew this existing application to continue their access up to 90 (`DAYS_POST_EXPIRY`) days past their expiry. This notification trigger is not affected by whether the applicant has already opened a renewal.
- query will retrieve all applications that are:
  - `APPROVED` or `PAUSED`
  - `expiresAtUtc` is between 45 (`DAYS_TO_EXPIRY_2`) days in the future and today
  - `emailNotifications.secondExpiryNotificationSent` is undefined
- no state change occurs on the application
- sets the `emailNotifications.secondExpiryNotificationSent` to the current date. This flag is to track whether an email has been sent, in the case where a job run is missed or an error occurs in the job run that prevents the email from being sent.

Example Report Result:

```
expiryNotifications2: {
    jobName: 'SECOND EXPIRY NOTIFICATIONS',
    startedAt: '2023-04-30T08:00:05.853Z',
    finishedAt: '2023-04-30T08:00:05.856Z',
    success: true,
    details: { count: 0, ids: [], errors: [], errorCount: 0 },
}
```

### Expire Applications

- file: [src/jobs/expireAppCheck.ts](./expireAppCheck.ts)
- Sends an email notification to the applicant and submitter that their application has expired and they will have lost access if they have not yet renewed. This notification trigger is not affected by whether the applicant has already opened a renewal.
- query will retrieve all applications that are:
  - `APPROVED`, `PAUSED` or `EXPIRED`
  - `expiresAtUtc` is today or earlier
  - `emailNotifications.applicationExpiredNotificationSent` is undefined
- sets the application state to `EXPIRED` if not already in that state
- adds an `EXPIRED` update event to the updates list
- sets the `emailNotifications.applicationExpiredNotificationSent` to the current date. This flag is to track whether an email has been sent, in the case where a job run is missed or an error occurs in the job run that prevents the email from being sent. This is also why `EXPIRED` is included as a possible state, in the case of the state transition having occurred on an earlier job run, but the email event failed.

Example Report Result:

```
expiredApps: {
    jobName: 'EXPIRING APPLICATIONS',
    startedAt: '2023-04-30T08:00:05.857Z',
    finishedAt: '2023-04-30T08:00:06.473Z',
    success: true,
    details: { ids: ['DACO-372', 'DACO-371'], count: 2, errors: [], errorCount: 0 },
}
```

### Close Unsubmitted Renewal Applications

- file: [src/jobs/closeUnsubmittedRenewalsCheck.ts](./closeUnsubmittedRenewalsCheck.ts)
- Closes any renewal applications that have not been submitted for `REVIEW` before the renewal period has ended, 90 (`DAYS_POST_EXPIRY`) days after a source application's expiry date. Once this occurs, the renewal cycle for an application is finished and an applicant would have to submit an entirely new application to regain controlled access. There is no email notification for this scenario.
- query will retrieve all applications that are:
  - `DRAFT`, `SIGN AND SUBMIT` or `REVISIONS REQUESTED`
  - `renewalPeriodEndDateUtc` is before today
  - `isRenewal` is `true`
- sets the application state to `CLOSED`
- adds a `CLOSED` update event to the updates list
- does not remove the `sourceAppId` that links the renewal to original application, in order to prevent the source application from becoming renewable again.

Example Report Result:

```
closedApps: {
    jobName: 'CLOSING UNSUBMITTED RENEWALS',
    startedAt: '2023-04-30T08:00:06.474Z',
    finishedAt: '2023-04-30T08:00:06.655Z',
    success: true,
    details: { ids: ['DACO-379'], count: 1, errors: [], errorCount: 0 },
}
```

### Approved Users List

- file: [src/jobs/approvedUsersEmail.ts](./approvedUsersEmail.ts)
- Retrieves a list of unique applicants and collaborators from all `APPROVED` applications in the system
- Creates a CSV file with headers `USER NAME` (`displayName`), `OPENID` (`googleEmail`), `EMAIL` (`institutionEmail`), `CHANGED` (`lastUpdatedAtUtc`), `AFFILIATION` (`primaryAffiliation`)
- encrypts the file
- emails the file to EGA. A new `iv` value is generated and sent for each email, and the recipient has the encryption key necessary to decrypt on their end.

Example Report Result:

```
approvedUsers: {
    jobName: 'APPROVED USERS EMAIL',
    startedAt: '2023-04-30T08:00:06.656Z',
    finishedAt: '2023-04-30T08:00:06.686Z',
    success: true,
}
```

### Environment Variables

These are the expected default values for DACO requirements, however they have been made configurable for testing convenience. They can be configured in your `.env` file.

The [src/config.ts](../config.ts) file contains default values so the application will run if these values are not provided in the environment. However, all date calculations are done via [moment.js](https://momentjs.com/), so there is a validation for any configured "unit of time" (`ATTESTATION_UNIT_OF_TIME`, `EXPIRY_UNIT_OF_TIME`) values to ensure they align with Moment's expected [Duration types](https://github.com/moment/moment/blob/develop/ts3.1-typings/moment.d.ts#L314). If an unexpected value is provided, the application will fail to start.\*

> **\*Note**: For our purposes, this validation excludes values smaller than `"days"` as shorter timespans are not feasible.

> **Important Note**: The `expiresAtUtc` value is saved in the DB application document, so it is important to be aware that changing the `EXPIRY_UNIT_OF_TIME` and/or `EXPIRY_UNIT_COUNT` after there are approved applications in the system would result in differing approval periods for applications. **This also means the value should not be changed in production.** The other values listed here are used to calculate fields that are not stored in the DB; however it is also not recommended to change them in a production environment, if there are existing approved applications.

| Variable Name              | Required | Type                                                                                                           |   Default | Description                                                                                                                                                                                                                                                                                                                     |
| -------------------------- | :------: | -------------------------------------------------------------------------------------------------------------- | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ATTESTATION_UNIT_COUNT`   | Optional | number                                                                                                         |       `1` | The number of units of time used to calculate an approved application's `attestationByUtc` value. Used in conjunction with `ATTESTATION_UNIT_COUNT`. An unattested application would be transitioned to `PAUSED` after this date.                                                                                               |
| `ATTESTATION_UNIT_OF_TIME` | Optional | `"year"`, `"years"`, `"y"`, `"month"`, `"months"`, `"M"`, `"week"`, `"weeks"`, `"w"`, `"day"`, `"days"`, `"d"` | `"years"` | The unit of time used to calculate an approved application's `attestationByUtc` value. Used in conjunction with `ATTESTATION_UNIT_COUNT`. An unattested application would be transitioned to `PAUSED` after this date.                                                                                                          |
| `DAYS_TO_ATTESTATION`      | Optional | number                                                                                                         |      `45` | the number of days before an application's `attestationByUtc` value, used in conjunction with the `ATTESTATION_UNIT_COUNT` and `ATTESTATION_UNIT_OF_TIME` to calculate the date when the attestation notification email should be sent.                                                                                         |
| `DAYS_TO_EXPIRY_1`         | Optional | number                                                                                                         |      `90` | the number of days before an application's `expiresAtUtc` value, used to calculate when the renewal period begins, and the first expiry notification email should be sent.                                                                                                                                                      |
| `DAYS_TO_EXPIRY_2`         | Optional | number                                                                                                         |      `45` | the number of days before an application's `expiresAtUtc` value, used to calculate when the second expiry notification email should be sent.                                                                                                                                                                                    |
| `DAYS_POST_EXPIRY`         | Optional | number                                                                                                         |      `90` | the number of days after an application's `expiresAtUtc` value, used to calculate when the renewal period ends. The calculated date is used by the source application to indicate whether it is still renewable, and whether any linked renewal application should be closed, if the renewal has not been submitted for review. |
| `EXPIRY_UNIT_COUNT`        | Optional | number                                                                                                         |       `2` | The number of units of time used to calculate an approved application's `expiresAtUtc`, and so the length of time an application grants access to controlled data. Used in conjunction with `EXPIRY_UNIT_OF_TIME`.                                                                                                              |
| `EXPIRY_UNIT_OF_TIME`      | Optional | `"year"`, `"years"`, `"y"`, `"month"`, `"months"`, `"M"`, `"week"`, `"weeks"`, `"w"`, `"day"`, `"days"`, `"d"` | `"years"` | The unit of time used to calculate expiry. Used in conjunction with `EXPIRY_UNIT_COUNT` to calculate an approved application's `expiresAtUtc`, and so the length of time an application grants access to controlled data.                                                                                                       |
