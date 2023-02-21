# dac-api

Development of the Data Access Control API

## Feature Flags

| Name                    | Config Path                   | Description                                                                                                                                                                                                                                                                                                               | Trigger                   | Default |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------- |
| FEATURE_RENEWAL_ENABLED | `featureFlags.renewalEnabled` | enables Renewal and Expiry features, incl. `/applications/{id}/renew` `POST` endpoint for creating a renewal application, and batch jobs triggered by `/jobs/batch-transitions` endpoint: `"FIRST EXPIRY NOTIFICATIONS"`, `"SECOND EXPIRY NOTIFICATIONS"`, `"EXPIRING APPLICATIONS"` and `"CLOSING UNSUBMITTED RENEWALS"` | set env value to `"true"` | `false` |
