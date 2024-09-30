# dac-api

Development of the Data Access Control API

## Development Mode

| Name       | Config Path   | Description                                                                               | Trigger                           | Default |
| ---------- | ------------- | ----------------------------------------------------------------------------------------- | --------------------------------- | ------- |
| `NODE_ENV` | isDevelopment | Enables `'/applications/:id'` DELETE endpoint. Enables `debug.log` file in Logger options | set `NODE_ENV` to `"development"` | `false` |

## Environment Variables

| Name                | Description                                                                   | Type     | Required | Default |
| ------------------- | ----------------------------------------------------------------------------- | -------- | -------- | ------- |
| EGA_CLIENT_ID       | Client ID for EGA API                                                         | `string` | true     |         |
| EGA_AUTH_HOST       | Root URL for EGA authentication server                                        | `string` | true     |         |
| EGA_AUTH_REALM_NAME | Realm name for EGA authentication server                                      | `string` | true     |         |
| EGA_API_URL         | Root URL for EGA API                                                          | `string` | true     |         |
| EGA_USERNAME        | Username for account used to gain access token from EGA authentication server | `string` | true     |         |
| EGA_PASSWORD        | Password for account used to gain access token from EGA authentication server | `string` | true     |         |
| DAC_ID              | AccessionId for ICGC DAC                                                      | `string` | true     |         |

## Feature Flags

| Name                        | Config Path                      | Description                                                                                                                                                                                                                                                                                                               | Trigger                   | Default |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------- |
| FEATURE_RENEWAL_ENABLED     | `featureFlags.renewalEnabled`    | enables Renewal and Expiry features, incl. `/applications/{id}/renew` `POST` endpoint for creating a renewal application, and batch jobs triggered by `/jobs/batch-transitions` endpoint: `"FIRST EXPIRY NOTIFICATIONS"`, `"SECOND EXPIRY NOTIFICATIONS"`, `"EXPIRING APPLICATIONS"` and `"CLOSING UNSUBMITTED RENEWALS"` | set env value to `"true"` | `false` |
| FEATURE_ADMIN_PAUSE_ENABLED | `featureFlags.adminPauseEnabled` | enables manual PAUSE transition of applications, using the Admin scope with the `/applications/{id}` `PATCH` or `/applications/:id/admin-pause` endpoints. Normally pausing is done only by the System role as a batch job. Intended for testing purposes only, **do not enable in production**                           | set env value to `"true"` | `false` |
