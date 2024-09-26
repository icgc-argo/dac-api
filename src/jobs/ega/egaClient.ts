/*
 * Copyright (c) 2024 The Ontario Institute for Cancer Research. All rights reserved
 *
 * This program and the accompanying materials are made available under the terms of
 * the GNU Affero General Public License v3.0. You should have received a copy of the
 * GNU Affero General Public License along with this program.
 *  If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import axios, { AxiosError, AxiosHeaders } from 'axios';
import urlJoin from 'url-join';
import { getAppConfig } from '../../config';
import logger from '../../logger';
import getAppSecrets from '../../secrets';

import {
  EGA_API,
  EGA_GRANT_TYPE,
  EGA_REALMS_PATH,
  EGA_TOKEN_ENDPOINT,
} from '../../utils/constants';
import { NotFoundError, TooManyRequestsError } from './errors';
import { DacAccessionId, DatasetAccessionId } from './types/common';
import { ApprovePermissionRequest, PermissionRequest, RevokePermission } from './types/requests';
import {
  ApprovePermissionResponse,
  Dataset,
  EgaPermission,
  EgaPermissionRequest,
  EgaUser,
  IdpToken,
  RevokePermissionResponse,
} from './types/responses';
import {
  ApprovedPermissionRequestsFailure,
  CreatePermissionRequestsFailure,
  failure,
  GetDatasetsForDacFailure,
  GetPermissionsByDatasetAndUserIdFailure,
  GetPermissionsForDatasetFailure,
  GetUserFailure,
  Result,
  RevokePermissionsFailure,
  safeParseArray,
  success,
  ZodResultAccumulator,
} from './types/results';
import { ApprovedUser, getErrorMessage } from './utils';

const { DACS, DATASETS, PERMISSIONS, REQUESTS, USERS } = EGA_API;

// initialize IDP client
const initIdpClient = () => {
  const {
    ega: { authHost },
  } = getAppConfig();
  return axios.create({
    baseURL: authHost,
  });
};
const idpClient = initIdpClient();

// initialize API client
const initApiAxiosClient = () => {
  const {
    ega: { apiUrl },
  } = getAppConfig();
  return axios.create({
    baseURL: apiUrl,
    headers: {
      'Content-Type': 'application/json',
    },
  });
};
const apiAxiosClient = initApiAxiosClient();

/**
 * POST request to retrieve an accessToken for the EGA API client
 * @returns Promise<IdpToken>
 */
const getAccessToken = async (): Promise<IdpToken> => {
  const {
    ega: { authRealmName, clientId },
  } = getAppConfig();
  const {
    auth: { egaUsername, egaPassword },
  } = await getAppSecrets();

  const response = await idpClient.post(
    urlJoin(EGA_REALMS_PATH, authRealmName, EGA_TOKEN_ENDPOINT),
    {
      grant_type: EGA_GRANT_TYPE,

      client_id: clientId,
      username: egaUsername,
      password: egaPassword,
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const token = IdpToken.safeParse(response.data);
  if (token.success) {
    return token.data;
  }
  logger.error('Authentication with EGA failed.');
  throw new Error('Failed to retrieve access token');
};

/**
 * POST request to retrieve a new access token via refresh token flow
 * @param token IdpToken
 * @returns IdpToken
 */
const refreshAccessToken = async (token: IdpToken): Promise<IdpToken> => {
  const {
    ega: { authRealmName, clientId },
  } = getAppConfig();
  const response = await idpClient.post(
    urlJoin(EGA_REALMS_PATH, authRealmName, EGA_TOKEN_ENDPOINT),
    {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: token.refresh_token,
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  const result = IdpToken.safeParse(response.data);
  if (result.success) {
    return result.data;
  }
  logger.error('Refresh access token request failed.');
  throw new Error('Failed to refresh access token');
};

/**
 * Fetches access token and attaches to Axios instance headers for apiClient
 * @returns API functions that use authenticated Axios instance
 */
export const egaApiClient = async () => {
  const {
    ega: { dacId },
  } = getAppConfig();
  const token = await getAccessToken();

  apiAxiosClient.defaults.headers.common['Authorization'] = `Bearer ${token.access_token}`;

  apiAxiosClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error instanceof AxiosError) {
        if (error.response && error.response.status === 401) {
          logger.info('Access expired, attempting refresh');
          // Access token has expired, refresh it
          try {
            const newAccessToken = await refreshAccessToken(token);
            // Update the request headers with the new access token
            const headers = new AxiosHeaders(error.config?.headers);
            headers.setAuthorization(`Bearer ${newAccessToken.access_token}`);
            error.config = {
              ...error.config,
              headers,
            };
            // Retry the original request
            return apiAxiosClient(error.config);
          } catch (refreshError) {
            // Handle token refresh error
            throw refreshError;
          }
        }
        if (error.status === 404) {
          throw new NotFoundError(error.message);
        }
        if (error.status === 429) {
          throw new TooManyRequestsError(error.message);
        }
      }
      return new Response('Server error', { status: 500 });
    },
  );

  /**
   * GET request to retrieve all currently release datasets released for a DAC
   * @param dacId DacAccessionId
   * @returns ZodResultAccumulator<Dataset>
   */
  const getDatasetsForDac = async (
    dacId: DacAccessionId,
  ): Promise<Result<ZodResultAccumulator<Dataset>, GetDatasetsForDacFailure>> => {
    const url = urlJoin(DACS, dacId, DATASETS);
    try {
      const { data } = await apiAxiosClient.get(url);
      const result = safeParseArray(Dataset, data);
      return success(result);
    } catch (err) {
      const errMessage = getErrorMessage(err, `Error retrieving datasets for DAC ${dacId}.`);
      logger.error(`Error retrieving datasets for DAC ${dacId}.`);
      return failure('SERVER_ERROR', errMessage);
    }
  };

  /**
   * Retrieve EGA user data for a DACO ApprovedUser
   * @returns EGAUser
   * @example
   * // returns
   *   {
   *    id: 123,
   *    username: boysue@example.com,
   *    email: boysue@example.com,
   *    accession_id: EGAW00000009999
   *   }
   * getUser('boysue@example.com')
   */
  const getUser = async (user: ApprovedUser): Promise<Result<EgaUser, GetUserFailure>> => {
    const url = urlJoin(USERS, user.email);
    try {
      const { data } = await apiAxiosClient.get(url);
      const egaUser = EgaUser.safeParse(data);
      if (egaUser.success) {
        return success(egaUser.data);
      }
      return failure('INVALID_USER', 'Failed to parse user response');
    } catch (err) {
      if (err instanceof AxiosError) {
        switch (err.code) {
          case 'NOT_FOUND':
            return failure('NOT_FOUND', 'User not found');
          default:
            return failure('SERVER_ERROR', 'Axios error');
        }
      } else {
        const errMessage = getErrorMessage(err, 'Get user request failed');
        logger.error('Get user request failed');
        return failure('SERVER_ERROR', errMessage);
      }
    }
  };

  /**
   * GET request for list of existing permissions for a dataset
   * Endpoint is paginated.
   * @param datasetAccessionId: DatasetAccessionId
   * @param limit number
   * @param offset number
   * @returns ZodResultAccumulator<EgaPermission>
   */
  const getPermissionsForDataset = async ({
    datasetAccessionId,
    limit,
    offset,
  }: {
    datasetAccessionId: DatasetAccessionId;
    limit: number;
    offset: number;
  }): Promise<Result<ZodResultAccumulator<EgaPermission>, GetPermissionsForDatasetFailure>> => {
    const url = urlJoin(DACS, dacId, PERMISSIONS);
    try {
      const { data } = await apiAxiosClient.get(url, {
        params: {
          dataset_accession_id: datasetAccessionId,
          limit,
          offset,
        },
      });

      const result = safeParseArray(EgaPermission, data);
      return success(result);
    } catch (err) {
      const errMessage = getErrorMessage(err, 'Get permissions for dataset request failed.');
      logger.error('Get permissions for dataset request failed.');
      return failure('SERVER_ERROR', errMessage);
    }
  };

  /**
   * GET request to retrieve existing dataset permissions for a user.
   * One permission result is expected with userId and datasetId params, but response from EGA API comes as an array
   * @param userId string
   * @param datasetId DatasetAccessionId
   * @returns ZodResultAccumulator<EgaPermission>
   */
  const getPermissionByDatasetAndUserId = async (
    userId: number,
    datasetId: DatasetAccessionId,
  ): Promise<
    Result<ZodResultAccumulator<EgaPermission>, GetPermissionsByDatasetAndUserIdFailure>
  > => {
    try {
      const url = urlJoin(DACS, dacId, PERMISSIONS);
      const { data } = await apiAxiosClient.get(url, {
        params: {
          dataset_accession_id: datasetId,
          user_id: userId,
        },
      });
      const result = safeParseArray(EgaPermission, data);
      return success(result);
    } catch (err) {
      const errMessage = getErrorMessage(err, 'Error retrieving permission for user');
      logger.error('Error retrieving permission for user');
      return failure('SERVER_ERROR', errMessage);
    }
  };

  /**
   * POST request to create PermissionRequests for a user
   * @param requests PermissionRequest[]
   * @returns ZodResultAccumulator<EgaPermissionRequest>
   * @example
   * // returns [
   * {
   *  "request_id": 1,
   *  "status": "pending",
   *  "request_data": {
   *    "comment": "I'd like to access the dataset"
   *  },
   *  "date": "2024-01-31T16:24:13.725724+00:00",
   *  "username": "boysue",
   *  "full_name": "Boy Sue",
   *  "email": "boysue@example.com",
   *  "organisation": "Research Center",
   *  "dataset_accession_id": "EGAD00000000001",
   *  "dataset_title": "Dataset 8",
   *  "dac_accession_id": "EGAC00000000001",
   *  "dac_comment": "ticket",
   *  "dac_comment_edited_at": "2024-01-31T16:25:13.725724+00:00"
   *  }
   * ]
   * createPermissionRequests([{
   *    username: "boysue",
   *    dac_accession_id: "EGAC00000000001",
   *    request_data: {
   *      "comment": "I'd like to access the dataset"
   *    },
   * }])
   */
  const createPermissionRequests = async (
    requests: PermissionRequest[],
  ): Promise<
    Result<ZodResultAccumulator<EgaPermissionRequest>, CreatePermissionRequestsFailure>
  > => {
    try {
      const { data } = await apiAxiosClient.post(REQUESTS, {
        requests,
      });
      const result = safeParseArray(EgaPermissionRequest, data);
      return success(result);
    } catch (err) {
      const errMessage = getErrorMessage(err, 'Create permissions request failed.');
      logger.error('Create permissions request failed');
      return failure('SERVER_ERROR', errMessage);
    }
  };

  /**
   * Approves permissions by permission id.
   * Endpoint accepts an array so multiple permissions can be approved in one request.
   * @param requests
   * @returns
   * @example
   * // returns { num_granted: 2 }
   * revokePermissions(
   * [
   *  { request_id: 10, expires_at: "2025-01-31T16:25:13.725724+00:00" },
   *  { request_id: 12, expires_at: "2026-01-31T16:25:13.725724+00:00" }
   * ]
   * )
   */
  const approvePermissionRequests = async (
    requests: ApprovePermissionRequest[],
  ): Promise<Result<ApprovePermissionResponse, ApprovedPermissionRequestsFailure>> => {
    try {
      const { data } = await apiAxiosClient.put(REQUESTS, {
        requests,
      });
      const result = ApprovePermissionResponse.safeParse(data);
      if (result.success) {
        return success(result.data);
      }
      return failure(
        'INVALID_APPROVE_PERMISSION_REQUESTS_RESPONSE',
        'Invalid response for approve permission requests.',
      );
    } catch (err) {
      const errMessage = getErrorMessage(err, 'Approve permissions requests failed.');
      logger.error('Create permissions request failed');
      return failure('SERVER_ERROR', errMessage);
    }
  };

  /**
   * Revokes permissions by permission id.
   * Endpoint accepts an array so multiple permissions can be revoke in one request.
   * @param requests RevokePermission[]
   * @returns RevokePermissionResponse
   * @example
   * // returns { num_revoked: 2 }
   * revokePermissions(
   * [
   *  { id: 10, reason: 'Access expired' },
   *  { id: 12, reason: 'Access expired' }
   * ]
   * )
   */
  const revokePermissions = async (
    requests: RevokePermission[],
  ): Promise<Result<RevokePermissionResponse, RevokePermissionsFailure>> => {
    try {
      const { data } = await apiAxiosClient.delete(PERMISSIONS, { data: requests });
      const result = RevokePermissionResponse.safeParse(data);
      if (result.success) {
        return success(result.data);
      }
      return failure(
        'INVALID_REVOKE_PERMISSIONS_RESPONSE',
        'Invalid response from revoke permissions request.',
      );
    } catch (err) {
      const errMessage = getErrorMessage(err, 'Revoke permissions request failed');
      logger.error('Revoke permissions request failed');
      return failure('SERVER_ERROR', errMessage);
    }
  };

  return {
    approvePermissionRequests,
    createPermissionRequests,
    getDatasetsForDac,
    getPermissionByDatasetAndUserId,
    getPermissionsForDataset,
    getUser,
    revokePermissions,
  };
};

export type EgaClient = Awaited<ReturnType<typeof egaApiClient>>;
