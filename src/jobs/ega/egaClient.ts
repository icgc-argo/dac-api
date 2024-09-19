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

import axios from 'axios';
import urlJoin from 'url-join';
import { getAppConfig } from '../../config';
import getAppSecrets from '../../secrets';
import { EGA_GRANT_TYPE, EGA_REALMS_PATH, EGA_TOKEN_ENDPOINT } from '../../utils/constants';

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
  console.log('Refresh response: ', response.status);
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
      console.log('Got here, error is ', error);
      if (error.response && error.response.status === 401) {
        console.log('Access expired, attempting refresh');
        // Access token has expired, refresh it
        try {
          const newAccessToken = await refreshAccessToken(token);
          // Update the request headers with the new access token
          error.config.headers['Authorization'] = `Bearer ${newAccessToken.access_token}`;
          // Retry the original request
          return apiAxiosClient(error.config);
        } catch (refreshError) {
          console.log('Refresh error: ', refreshError);
          // Handle token refresh error
          throw refreshError;
        }
      }
      console.log('General error: ', error);
      return Promise.reject(error);
    },
  );

  const getDacs = async () => {
    const response = await apiAxiosClient.get('/dacs');
    return response.data;
  };

  return { getDacs };
};
