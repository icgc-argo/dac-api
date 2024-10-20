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

import axios, { AxiosError } from 'axios';
import urlJoin from 'url-join';
import { getAppConfig } from '../../../config';
import logger from '../../../logger';

import pThrottle from '../../../../pThrottle';
import { EGA_API } from '../../../utils/constants';
import { DacAccessionId, DatasetAccessionId } from '../types/common';
import { BadRequestError, NotFoundError, ServerError } from '../types/errors';
import { ApprovePermissionRequest, PermissionRequest, RevokePermission } from '../types/requests';
import {
  ApprovePermissionResponse,
  EgaDataset,
  EgaPermission,
  EgaPermissionRequest,
  EgaUser,
  IdpToken,
  RevokePermissionResponse,
} from '../types/responses';
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
  success,
} from '../types/results';
import { safeParseArray, ZodResultAccumulator } from '../types/zodSafeParseArray';
import { ApprovedUser, getErrorMessage } from '../utils';
import { fetchAccessToken, tokenExpired } from './idpClient';

const { DACS, DATASETS, PERMISSIONS, REQUESTS, USERS } = EGA_API;

const CLIENT_NAME = 'EGA_API_CLIENT';

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
 * Fetches access token and attaches to Axios instance headers for apiClient
 * @returns API functions that use authenticated Axios instance
 */
export const egaApiClient = async () => {
  const {
    ega: { dacId, maxRequestLimit, maxRequestInterval },
  } = getAppConfig();

  let currentToken: IdpToken | undefined = undefined;
  let refreshTokenPromise: Promise<IdpToken> | undefined = undefined; // this holds any in-progress token refresh requests

  const getAccessToken = async (): Promise<IdpToken> => {
    if (currentToken) {
      const tokenIsExpired = await tokenExpired(currentToken);
      if (tokenIsExpired) {
        logger.info('token is expired');
        resetAccessToken();
      } else {
        return currentToken;
      }
    }
    if (refreshTokenPromise) {
      return refreshTokenPromise;
    }
    refreshTokenPromise = fetchAccessToken()
      .then((rToken) => {
        currentToken = rToken;
        return rToken;
      })
      .finally(() => {
        // reset refreshTokenPromise state
        refreshTokenPromise = undefined;
      });
    return refreshTokenPromise;
  };

  const resetAccessToken = (): void => {
    currentToken = undefined;
  };

  // default rate limit requests to a maximum of 3 per 1 second
  const throttle = pThrottle({
    limit: maxRequestLimit,
    interval: maxRequestInterval,
  });

  const accessToken = await getAccessToken();
  apiAxiosClient.defaults.headers.common['Authorization'] = `Bearer ${accessToken.access_token}`;

  apiAxiosClient.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error instanceof AxiosError) {
        // Must check for error.response *before* error.request, because a 401 error will also trigger error.request
        // This can cause an endless loop where the token is never refreshed
        if (error.response) {
          if (error.config) {
            logger.error(`${CLIENT_NAME} - AxiosError - error.response - error.config`);
            switch (error.response.status) {
              case 401:
                logger.info('Access token expired');
                if (!refreshTokenPromise) {
                  resetAccessToken();
                }
                const updatedAccessToken = await getAccessToken();
                const refreshedBearerToken = `Bearer ${updatedAccessToken.access_token}`;
                // set new token on original request that had the 401 error
                error.config.headers['Authorization'] = refreshedBearerToken;
                // reset on client headers so subsequent requests have new access token
                apiAxiosClient.defaults.headers['Authorization'] = refreshedBearerToken;
                // returns Promise for original request
                return apiAxiosClient.request(error.config);
              case 400:
                // don't retry
                logger.error(`Bad Request`);
                return new BadRequestError(error.message);
              case 404:
                logger.error(`Not Found`);
                // don't retry
                return new NotFoundError(error.message);
              case 429:
                logger.error(`Too Many Requests`);
                logger.error(
                  `${CLIENT_NAME} - ${error.response.status} - ${error.response.statusText} - retrying original request.`,
                );
                // retry original request. this response error shouldn't be an issue because throttling is in place
                return apiAxiosClient.request(error.config);
              case 504:
                logger.error(
                  `${CLIENT_NAME} - ${error.response.status} - ${error.response.statusText} - retrying original request.`,
                );
                // retry original request
                return apiAxiosClient.request(error.config);
              default:
                logger.error(`Unexpected Axios Error: ${error.response.status}`);
                return new ServerError('Unexpected Axios Error');
            }
          }
        } else if (error.request) {
          switch (error.code) {
            case 'ECONNRESET':
              // socket hangup is caught here
              const originalRequest = error.config;
              logger.error(`${CLIENT_NAME} - AxiosError - ECONNRESET`);
              if (originalRequest) {
                logger.info(`${CLIENT_NAME} - ECONNRESET - retrying original request`);
                return apiAxiosClient.request(originalRequest);
              }
              return Promise.reject(error);
            case 'ERR_BAD_REQUEST':
              logger.error(`${CLIENT_NAME} - AxiosError - ERR_BAD_REQUEST`);
              return new BadRequestError(`${error.code} - ${error.message}`);
            default:
              return new ServerError(`Unknown error from Axios error.request: ${error.code}`);
          }
        }
      }
      logger.error(`${CLIENT_NAME} - Unknown error, rejecting ${error}`);
      return Promise.reject(error);
    },
  );

  /**
   * GET request to retrieve all currently release datasets released for a DAC
   * @param dacId DacAccessionId
   * @returns ZodResultAccumulator<EgaDataset>
   */
  const getDatasetsForDac = async (
    dacId: DacAccessionId,
  ): Promise<Result<ZodResultAccumulator<EgaDataset>, GetDatasetsForDacFailure>> => {
    const url = urlJoin(DACS, dacId, DATASETS);
    try {
      const { data } = await apiAxiosClient.get(url);
      const result = safeParseArray(EgaDataset, data);
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
      const response = await apiAxiosClient.get(url);
      const egaUser = EgaUser.safeParse(response.data);
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
      const response = await apiAxiosClient.get(url, {
        params: {
          dataset_accession_id: datasetAccessionId,
          limit,
          offset,
        },
      });
      if (response) {
        const result = safeParseArray(EgaPermission, response.data);
        return success(result);
      }
      throw new ServerError('No response from GET /dacs/{dacId}/permissions');
    } catch (err) {
      const errMessage = getErrorMessage(err, 'Get permissions for dataset request failed.');
      logger.error('Get permissions for dataset request failed.');
      // this error return here doesn't differentiate the type, so you may need more checks to see if it is retryable
      // i.e., socket hangup, too many requests. although the former may not bubble that far with current ega client setup
      return failure('SERVER_ERROR', errMessage);
    }
  };

  /**
   * GET request to retrieve existing dataset permissions for a user.
   * One permission result is expected with userId and datasetId params, but response from EGA API comes as an array
   * @param userId string
   * @param datasetsTotal number - total number of datasets expected for DAC
   * @returns ZodResultAccumulator<EgaPermission>
   */
  const getPermissionsByUserId = async (
    userId: number,
    datasetsTotal: number,
  ): Promise<
    Result<ZodResultAccumulator<EgaPermission>, GetPermissionsByDatasetAndUserIdFailure>
  > => {
    // logger.info(`GetPermissionsByUserId [${userId}]`);
    try {
      const url = urlJoin(PERMISSIONS);
      const response = await apiAxiosClient.get(url, {
        params: {
          user_id: userId,
          limit: datasetsTotal,
        },
      });
      if (response) {
        const result = safeParseArray(EgaPermission, response.data);
        return success(result);
      }
      throw new ServerError('No response from GET /permissions?user_id');
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
      const { data } = await apiAxiosClient.post(REQUESTS, requests);
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
      const response = await apiAxiosClient.put(REQUESTS, requests);
      if (response.data) {
        const result = ApprovePermissionResponse.safeParse(response.data);
        if (result.success) {
          return success(result.data);
        }
        return failure(
          'INVALID_APPROVE_PERMISSION_REQUESTS_RESPONSE',
          `Invalid response from approve permission requests: ${result.error}`,
        );
      }
      throw new ServerError(response.statusText);
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
      const response = await apiAxiosClient.delete(PERMISSIONS, { data: requests });
      if (response.status === 400) {
        throw new BadRequestError('Permission not found.');
      }
      const result = RevokePermissionResponse.safeParse(response.data);
      if (result.success) {
        return success(result.data);
      }
      return failure(
        'INVALID_REVOKE_PERMISSIONS_RESPONSE',
        `Invalid response from revoke permissions request: ${result.error}`,
      );
    } catch (err) {
      if (err instanceof AxiosError) {
        switch (err.code) {
          case 'BAD_REQUEST':
            return failure('PERMISSION_DOES_NOT_EXIST', 'Permission not found.');
          default:
            return failure('SERVER_ERROR', 'Axios error');
        }
      }
      const errMessage = getErrorMessage(err, 'Revoke permissions request failed');
      logger.error('Revoke permissions request failed');
      return failure('SERVER_ERROR', errMessage);
    }
  };

  return {
    approvePermissionRequests: throttle(approvePermissionRequests),
    createPermissionRequests: throttle(createPermissionRequests),
    getDatasetsForDac: throttle(getDatasetsForDac),
    getPermissionsByUserId: throttle(getPermissionsByUserId),
    getPermissionsForDataset: throttle(getPermissionsForDataset),
    getUser: throttle(getUser),
    revokePermissions: throttle(revokePermissions),
  };
};

export type EgaClient = Awaited<ReturnType<typeof egaApiClient>>;
