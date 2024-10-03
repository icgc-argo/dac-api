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

import logger from '../../../logger';
import { EgaClient } from '../egaClient';
import { EgaDacoUserMap } from '../types/responses';
import { ApprovedUser } from '../utils';

/**
 * Retrieve EGA user data for each user on DACO approved list
 * @param client EgaClient
 * @param dacoUsers ApprovedUser[]
 * @returns EgaDacoUserMap
 * @example
 * // returns {
 *   boysue@example.com: {
 *    id: 123,
 *    username: boysue@example.com,
 *    email: boysue@example.com,
 *    accession_id: EGAW00000009999,
 *    appExpiry: 2024-10-01T14:06:41.485Z,
 *    appId: 'DACO-1'
 *   }
 * ...
 * }
 * getUsers(client, approvedUsersList)
 */
export const getUsers = async (
  client: EgaClient,
  approvedUsers: ApprovedUser[],
): Promise<EgaDacoUserMap> => {
  let egaUsers: EgaDacoUserMap = {};
  for await (const user of approvedUsers) {
    try {
      const egaUser = await client.getUser(user);
      switch (egaUser.status) {
        case 'SUCCESS':
          const { data } = egaUser;
          const egaDacoUser = {
            ...data,
            appExpiry: user.appExpiry,
            appId: user.appId,
          };
          egaUsers[data.username] = egaDacoUser;
          break;
        case 'NOT_FOUND':
          logger.debug(`No user found for [${user.email}].`);
          break;
        case 'INVALID_USER':
          logger.error(`Invalid user: ${egaUser.message}`);
          break;
        case 'SERVER_ERROR':
          logger.error(`Server error: ${egaUser.message}`);
          break;
        default:
          logger.error('Unexpected error fetching user');
      }
    } catch (err) {
      logger.error(err);
    }
  }
  return egaUsers;
};
