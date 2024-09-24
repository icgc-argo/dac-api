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
import getAppSecrets from '../../secrets';
import logger from '../../logger';

import {
  EGA_API,
  EGA_GRANT_TYPE,
  EGA_REALMS_PATH,
  EGA_TOKEN_ENDPOINT,
} from '../../utils/constants';
import { EgaPermission, EgaUser } from './types';
import { getApprovedUsers } from './utils';
import { NotFoundError } from './errors';

const { DACS, PERMISSIONS, USERS } = EGA_API;
const DAC_ACCESSION_ID = 'EGAC00001000010';

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
   * Retrieve a list of DACs of which the user is a member
   * @returns Dac[]
   * @example
   * // returns [
   *   {
   *    "provisional_id": 0,
   *    "accession_id": "123",
   *    "title": "'Dac 1'",
   *    "description": "Dac 1",
   *    "status": "accepted",
   *    "declined_reason": null
   *   }
   * ]
   */
  const getDacs = async () => {
    const response = await apiAxiosClient.get('/dacs');
    return response.data;
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
   */
  const getUsers = async (): Promise<EgaUser[]> => {
    const dacoUsers = await getApprovedUsers();
    let egaUsers: EgaUser[] = [];
    for await (const user of dacoUsers) {
      try {
        // TODO: handle 404 properly. If the User is not in EGA, do we add to report? Or just ignore? We can't proceed with permissions without a userId
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

  const getPermissionsForDataset = async (dataset_accession_id: string) => {
    const url = urlJoin(DACS, DAC_ACCESSION_ID, PERMISSIONS);

    let results: EgaPermission[] = [];
    let offset = 0;
    let limit = 100;
    let paging = true;

    // loop will stop once result length from GET is less than limit
    while (paging) {
      const permissions = await apiAxiosClient.get(url, {
        params: {
          dataset_accession_id,
          limit,
          offset,
        },
      });
      // TODO: add permission to a "toDelete" list if not found in approved list
      // this function will return that list to be sent to the revoke function
      results.push(permissions.data);
      offset = offset + 100;
      paging = permissions.data.length >= limit;
      console.log(results.length);
    }
    return results.flat();
  };

  // TODO: add remaining API requests
  const getPermissionByDatasetAndUserId = async () => {};
  const createPermissionRequests = async () => {};
  const approvePermissionRequests = async () => {};
  const revokePermissions = async () => {};
  return { getDacs, getPermissionsForDataset, getUsers };
};
