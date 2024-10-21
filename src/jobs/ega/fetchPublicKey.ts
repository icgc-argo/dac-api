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

import urlJoin from 'url-join';
import { AppConfig } from '../../config';

/**
 * Fetches public key value from specified Keycloak host and realm, if both values are present in the appConfig
 * @param appConfig
 * @returns string | undefined - formatted public key string or undefined
 */
export const fetchPublicKeyFromKeycloak = async (
  appConfig: AppConfig,
): Promise<string | undefined> => {
  const { authHost, authRealmName } = appConfig.ega;
  if (!authHost || !authRealmName) {
    console.error('Keycloak realm info not provided in config, aborting fetch attempt.');
    return undefined;
  }
  console.info(`Fetching public key from Keycloak realm ${authRealmName}.`);
  const keycloakUrl = urlJoin(authHost, 'realms', authRealmName);
  try {
    const response = await fetch(keycloakUrl);
    const result = await response.json();
    return `-----BEGIN PUBLIC KEY-----\n${result.public_key}\n-----END PUBLIC KEY-----`;
  } catch (err) {
    console.error(`Failed to fetch public key from realm ${authRealmName}:`, err);
    return undefined;
  }
};
