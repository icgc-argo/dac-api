# dac-api

Development of the Data Access Control API

## Development Mode

| Name       | Config Path   | Description                                                                               | Trigger                           | Default |
| ---------- | ------------- | ----------------------------------------------------------------------------------------- | --------------------------------- | ------- |
| `NODE_ENV` | isDevelopment | Enables `'/applications/:id'` DELETE endpoint. Enables `debug.log` file in Logger options | set `NODE_ENV` to `"development"` | `false` |

## Environment Variables

| Name                                 | Description                                                                                                                                                                                              | Type     | Required | Default |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | ------- |
| EGA_CLIENT_ID                        | Client ID for EGA API                                                                                                                                                                                    | `string` | true     |         |
| EGA_AUTH_HOST                        | Root URL for EGA authentication server                                                                                                                                                                   | `string` | true     |         |
| EGA_AUTH_REALM_NAME                  | Realm name for EGA authentication server                                                                                                                                                                 | `string` | true     |         |
| EGA_API_URL                          | Root URL for EGA API                                                                                                                                                                                     | `string` | true     |         |
| EGA_USERNAME                         | Username for account used to gain access token from EGA authentication server                                                                                                                            | `string` | true     |         |
| EGA_PASSWORD                         | Password for account used to gain access token from EGA authentication server                                                                                                                            | `string` | true     |         |
| DAC_ID                               | AccessionId for ICGC DAC                                                                                                                                                                                 | `string` | true     |         |
| EGA_MAX_REQUEST_LIMIT                | For EGA API rate limiting. The max number of API requests per interval value `EGA_MAX_REQUEST_INTERVAL`                                                                                                  | `number` | true     | 3       |
| EGA_MAX_REQUEST_INTERVAL             | For EGA API rate limiting. Interval of time for API request limit `EGA_MAX_REQUEST_LIMIT`, in milliseconds                                                                                               | `number` | true     | 1000    |
| EGA_MAX_REQUEST_RETRIES              | Maximum number of API requests allowed before rejecting the original request. Used in the `axios-retry` config for the [EGA Axios client](./src/jobs/ega/axios/egaClient.ts)                             | `number` | true     | 3       |
| EGA_MAX_ACCESS_TOKEN_REQUEST_RETRIES | Maximum number of API requests allowed to the EGA IDP server, before rejecting the original request. Used in the `axios-retry` config for the [EGA Auth Axios client](./src/jobs/ega/axios/idpClient.ts) | `number` | true     | 5       |

## Feature Flags

| Name                               | Config Path                             | Description                                                                                                                                                                                                                                                                                                               | Trigger                   | Default |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------- |
| FEATURE_RENEWAL_ENABLED            | `featureFlags.renewalEnabled`           | enables Renewal and Expiry features, incl. `/applications/{id}/renew` `POST` endpoint for creating a renewal application, and batch jobs triggered by `/jobs/batch-transitions` endpoint: `"FIRST EXPIRY NOTIFICATIONS"`, `"SECOND EXPIRY NOTIFICATIONS"`, `"EXPIRING APPLICATIONS"` and `"CLOSING UNSUBMITTED RENEWALS"` | set env value to `"true"` | `false` |
| FEATURE_ADMIN_PAUSE_ENABLED        | `featureFlags.adminPauseEnabled`        | enables manual PAUSE transition of applications, using the Admin scope with the `/applications/{id}` `PATCH` or `/applications/:id/admin-pause` endpoints. Normally pausing is done only by the System role as a batch job. Intended for testing purposes only, **do not enable in production**                           | set env value to `"true"` | `false` |
| FEATURE_EGA_RECONCILIATION_ENABLED | `featureFlags.egaReconciliationEnabled` | **Enables** [EGA reconciliation job process](./src/jobs/ega/egaPermissionsReconciliation.ts) triggered by `/jobs/batch-transitions` endpoint. **Disables** [Approved users email job](./src/jobs/approvedUsersEmail.ts) triggered in same endpoint.                                                                       | set env value to `"true"` | `false` |
