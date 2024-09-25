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
import { NotFoundError } from './errors';
import {
  ApprovePermissionRequest,
  ApprovePermissionResponse,
  DacAccessionId,
  Dataset,
  DatasetAccessionId,
  EgaPermission,
  EgaPermissionRequest,
  EgaUser,
  PermissionRequest,
  RevokePermission,
  RevokePermissionResponse,
} from './types';
import { getApprovedUsers, safeParseArray, ZodResultAccumulator } from './utils';

const { DACS, DATASETS, PERMISSIONS, REQUESTS, USERS } = EGA_API;

type IdpToken = {
  access_token: string;
  scope: string;
  session_state: string;
  token_type: 'Bearer';
  refresh_token: string;
  refresh_expires_in: number;
  expires_in: number;
  'not-before-policy': 0;
};

// initialize idp client
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
 * @returns Promise<any>
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

  const token = response.data;
  return token;
};

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

  return response.data;
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
          console.log('Access expired, attempting refresh');
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
            console.log('Refresh error: ', refreshError);
            // Handle token refresh error
            throw refreshError;
          }
        }
        if (error.status === 404) {
          throw new NotFoundError(error.message);
        }
      }
      return Promise.reject(error);
    },
  );

  /**
   * GET request to retrieve all currently release datasets released for a DAC
   * @param dacId DacAccessionId
   * @returns Dataset[]
   */
  const getDatasetsForDac = async (dacId: DacAccessionId): Promise<Dataset[]> => {
    const url = urlJoin(DACS, dacId, DATASETS);
    try {
      const { data } = await apiAxiosClient.get(url);
      return data;
    } catch (err) {
      logger.error(`Error retrieving datasets for DAC ${dacId}.`);
      return [];
    }
  };

  /**
   * Retrieve EGA user data for each user on DACO approved list
   * @returns EGAUser[]
   * @example
   * // returns [
   *   {
   *    id: 123,
   *    username: boysue@example.com,
   *    email: boysue@example.com,
   *    accession_id: EGAW00000009999
   *   }
   * ]
   * getUser('boysue@example.com')
   */
  const getUsers = async (): Promise<EgaUser[]> => {
    const dacoUsers = await getApprovedUsers();
    let egaUsers: EgaUser[] = [];
    for await (const user of dacoUsers) {
      try {
        const { data } = await apiAxiosClient.get(urlJoin(USERS, user.email));
        const egaUser = EgaUser.safeParse(data);
        if (egaUser.success) {
          logger.info('Successfully parsed ', user.email, '. Adding to list.');
          egaUsers.push(egaUser.data);
        }
      } catch (err) {
        if (err instanceof AxiosError) {
          switch (err.code) {
            case 'NOT_FOUND':
              // TODO: add user to error report?
              logger.error('User not found');
              break;
            default:
              logger.error('Axios error');
          }
        } else {
          logger.error('System error');
        }
      }
    }
    return egaUsers;
  };

  /**
   * GET request for list of existing permissions for a dataset
   * Endpoint is paginated.
   * @param datasetAccessionId: DatasetAccessionId
   * @param limit number
   * @param offset number
   * @returns EgaPermission[]
   */
  const getPermissionsForDataset = async ({
    datasetAccessionId,
    limit,
    offset,
  }: {
    datasetAccessionId: DatasetAccessionId;
    limit: number;
    offset: number;
  }): Promise<ZodResultAccumulator<EgaPermission> | undefined> => {
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
      return result;
    } catch (err) {
      logger.error(err);
      return undefined;
    }
  };

  /**
   * GET request to retrieve existing dataset permissions for a user
   * @param userId string
   * @param datasetId DatasetAccessionId
   * @returns EgaPermission[]
   */
  const getPermissionByDatasetAndUserId = async (
    userId: string,
    datasetId: DatasetAccessionId,
  ): Promise<EgaPermission | undefined> => {
    try {
      const url = urlJoin(DACS, dacId, PERMISSIONS);
      const { data } = await apiAxiosClient.get(url, {
        params: {
          dataset_accession_id: datasetId,
          user_id: userId,
        },
      });
      if (!data.length) {
        return undefined;
      }
      const result = EgaPermission.safeParse(data[0]);
      if (result.success) {
        return result.data;
      }
    } catch (err) {
      logger.error('Error retrieving permission for user');
    }
  };

  /**
   * POST request to create PermissionRequests for a user
   * @param requests PermissionRequest[]
   * @returns EgaPermissionRequest[]
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
  ): Promise<EgaPermissionRequest[] | undefined> => {
    try {
      const { data } = await apiAxiosClient.post(REQUESTS, {
        requests,
      });
      return data;
    } catch (err) {
      logger.error('Create permissions request failed');
      return undefined;
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
  ): Promise<ApprovePermissionResponse | undefined> => {
    try {
      const { data } = await apiAxiosClient.put(REQUESTS, {
        requests,
      });
      return data;
    } catch (err) {
      logger.error('Create permissions request failed');
      return undefined;
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
  ): Promise<RevokePermissionResponse | undefined> => {
    try {
      const { data } = await apiAxiosClient.delete(PERMISSIONS, { data: requests });
      return data;
    } catch (err) {
      logger.error('Create permissions request failed');
      return undefined;
    }
  };

  return {
    approvePermissionRequests,
    createPermissionRequests,
    getDatasetsForDac,
    getPermissionByDatasetAndUserId,
    getPermissionsForDataset,
    getUsers,
    revokePermissions,
  };
};

export type EgaClient = Awaited<ReturnType<typeof egaApiClient>>;
