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
import jwt from 'jsonwebtoken';
import urlJoin from 'url-join';
import { getAppConfig } from '../../../config';
import logger from '../../../logger';
import getAppSecrets from '../../../secrets';

import { EGA_GRANT_TYPE, EGA_REALMS_PATH, EGA_TOKEN_ENDPOINT } from '../../../utils/constants';
import { IdpToken } from '../types/responses';
const { verify } = jwt;

const CLIENT_NAME = 'IDP_CLIENT';

/**
 * Verifies an access token string has valid signature + is not expired
 * Uses jsonwebtoken.verify
 * @param token
 * @returns jwt.JwtPayload | undefined | string
 */
const decodeToken = async (
  token: string,
): Promise<jwt.JwtPayload | 'TokenExpiredError' | undefined> => {
  logger.info('Verifying token');
  const {
    auth: { egaPublicKey },
  } = await getAppSecrets();

  const decoded = verify(token, egaPublicKey, { algorithms: ['RS256'] });
  if (typeof decoded == 'string' || decoded === null) {
    switch (true) {
      case decoded === 'TokenExpiredError':
        return 'TokenExpiredError';
      case decoded === 'JsonWebTokenError':
        logger.error(`Invalid JWT format`);
        return undefined;
      default:
        logger.error(`Error decoding JWT`);
        return undefined;
    }
  }
  return decoded;
};

/**
 * Uses jsonwebtoken.verify to validate token is not expired.
 * Returns true if token is expired, otherwise returns false; the token may be invalid and still return false
 * @param token IdpToken
 * @returns Promise<boolean>
 */
export const isTokenExpired = async (token: IdpToken): Promise<boolean> => {
  const decoded = await decodeToken(token.access_token);
  return decoded === 'TokenExpiredError';
};

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

idpClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    switch (true) {
      case error instanceof AxiosError:
        logger.error(`${CLIENT_NAME} - Instanceof AxiosError`);
        if (error.response) {
          logger.error(`${CLIENT_NAME} - Error.response - ${error.code}`);
        } else if (error.request) {
          logger.error(
            `${CLIENT_NAME} - AxiosError - Error in [error.request], code: ${error.code}, message: ${error.message}`,
          );
          // socket hangup is caught here
          // is caught here before bubbling up to fetch function
          switch (error.code) {
            case 'ECONNRESET':
              logger.error(`${CLIENT_NAME} - AxiosError - ECONNRESET`);
              const originalRequest = error.config;
              if (originalRequest) {
                logger.info(`${CLIENT_NAME} - retrying original request`);
                return idpClient.request(originalRequest);
              }
              break;
            default:
              return Promise.reject(error);
          }
        } else {
          logger.error(
            `${CLIENT_NAME} - Instanceof AxiosError - Unknown error - message: ${error.message} - code: ${error.code}`,
          );
        }
        break;
      case error instanceof Error:
        logger.error(`${CLIENT_NAME} - Instanceof Error message: ${error.message}`);
        return Promise.reject(error);
      default:
        logger.error(`${CLIENT_NAME} - Unknown error type: ${error}`);
        return Promise.reject(error);
    }
  },
);

/**
 * POST request to retrieve an accessToken for the EGA API client
 * @returns Promise<IdpToken>
 */
export const fetchAccessToken = async (): Promise<IdpToken> => {
  const {
    ega: { authRealmName, clientId },
  } = getAppConfig();
  const {
    auth: { egaUsername, egaPassword },
  } = await getAppSecrets();

  try {
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
    logger.error(`Invalid token response: ${token.error.issues}`);
    throw new Error('Invalid token response');
  } catch (err) {
    if (err instanceof Error) {
      logger.error(`Error from fetch token request: ${err}`);
      throw new Error(err.message);
    } else {
      logger.error(`Unexpected error from fetch token request: ${err}`);
      throw err;
    }
  }
};
