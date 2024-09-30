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

import { getAppConfig } from '../config';
import logger, { buildMessage } from '../logger';
import { egaApiClient, EgaClient } from './ega/egaClient';
import { DatasetAccessionId } from './ega/types/common';
import { RevokePermission } from './ega/types/requests';
import { Dataset, EgaDacoUserMap } from './ega/types/responses';
import { isSuccess } from './ega/types/results';
import {
  ApprovedUser,
  createPermissionApprovalRequest,
  createPermissionRequest,
  createRevokePermissionRequest,
  getApprovedUsers,
  verifyPermissionApprovals,
} from './ega/utils';

const JOB_NAME = 'RECONCILE_EGA_PERMISSIONS';

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
 *    appExpiry: '2024-10-01T14:06:41.485Z',
 *    appId: 'DACO-1'
 *   }
 * ...
 * }
 * getUsers(client, approvedUsersList)
 */
const getUsers = async (
  client: EgaClient,
  approvedUsers: ApprovedUser[],
): Promise<EgaDacoUserMap> => {
  let egaUsers: EgaDacoUserMap = {};
  for await (const user of approvedUsers) {
    try {
      const egaUser = await client.getUser(user);
      if (egaUser.status === 'SUCCESS') {
        const { data } = egaUser;
        const egaDacoUser = {
          ...data,
          appExpiry: user.appExpiry.toDateString(),
          appId: user.appId,
        };
        egaUsers[data.username] = egaDacoUser;
      }
    } catch (err) {
      logger.error(err);
    }
  }
  return egaUsers;
};

const processPermissionsForApprovedUsers = async (
  egaClient: EgaClient,
  egaUsers: EgaDacoUserMap,
  datasets: Dataset[],
) => {
  const userList = Object.values(egaUsers);

  for await (const approvedUser of userList) {
    const permissionRequests = [];
    for await (const dataset of datasets) {
      // check for existing permission
      const existingPermission = await egaClient.getPermissionByDatasetAndUserId(
        approvedUser.id,
        dataset.accession_id,
      );
      if (isSuccess(existingPermission)) {
        if (existingPermission.data.success.length === 0) {
          // create permission request, add to requestList
          const permissionRequest = createPermissionRequest(
            approvedUser.username,
            dataset.accession_id,
          );
          permissionRequests.push(permissionRequest);
        }
      }
    }
    if (permissionRequests.length) {
      // POST all requests
      const createRequestsResponse = await egaClient.createPermissionRequests(permissionRequests);
      if (!isSuccess(createRequestsResponse)) {
        throw new Error('Failed to create permissions requests');
      }
      // create approval requests objs + send all
      const approvalRequests = createRequestsResponse.data.success.map((request) =>
        createPermissionApprovalRequest(request.request_id, approvedUser.appExpiry),
      );
      const approvePermissionRequestsResponse = await egaClient.approvePermissionRequests(
        approvalRequests,
      );
      if (isSuccess(approvePermissionRequestsResponse)) {
        verifyPermissionApprovals(approvalRequests.length, approvePermissionRequestsResponse.data);
      }
    }
  }
  logger.info('Completed processing permissions for all DACO approved users.');
};

const DEFAULT_OFFSET = 50;
const DEFAULT_LIMIT = 50;

/**
 * Paginates through all permissions for a dataset and revokes permissions for users not found in approvedUsers
 * @param client EgaClient
 * @param dataset_accession_id DatasetAccessionId
 * @param approvedUsers EgaDacoUserMap
 * @returns void
 */
export const processPermissionsForDataset = async (
  client: EgaClient,
  datasetAccessionId: DatasetAccessionId,
  approvedUsers: EgaDacoUserMap,
): Promise<void> => {
  let permissionsToRevoke: RevokePermission[] = [];
  let offset = 0;
  let limit = DEFAULT_LIMIT;
  let paging = true;

  // loop will stop once result length from GET is less than limit
  while (paging) {
    const permissions = await client.getPermissionsForDataset({
      datasetAccessionId,
      limit,
      offset,
    });
    if (isSuccess(permissions)) {
      const { success: permissionsSuccesses, failure: permissionsFailures } = permissions.data;
      permissionsSuccesses.map((permission) => {
        // check if permission username is found in approvedUsers
        const hasAccess = approvedUsers[permission.username];
        if (!hasAccess) {
          const revokeRequest = createRevokePermissionRequest(permission.permission_id);
          permissionsToRevoke.push(revokeRequest);
        }
      });
      offset = offset + DEFAULT_OFFSET;
      const totalResults = permissionsFailures.length + permissionsSuccesses.length;
      paging = totalResults >= limit;
    }
  }
  if (permissionsToRevoke.length) {
    const revokeResponse = await client.revokePermissions(permissionsToRevoke);
    if (isSuccess(revokeResponse)) {
      logger.info(
        `Successfully revoked ${revokeResponse.data.num_revoked} of total ${permissionsToRevoke.length} permissions for DATASET ${datasetAccessionId}.`,
      );
    } else {
      logger.error(
        `There was an error revoking permissions for DATASET ${datasetAccessionId} - ${revokeResponse.message}.`,
      );
    }
  } else {
    logger.info(`There are no permissions to revoke for DATASET ${datasetAccessionId}.`);
  }
};

/**
 * Steps:
 * 1) Retrieve approved users list from dac db
 * 2) Retrieve datasets for DAC
 * 3) Retrieve corresponding list of users from EGA API
 * 4) Create permissions, on each dataset, for each user on the DACO approved list, if no existing permission is found
 * 5) Process existing permissions for each dataset + revoke those which belong to users not on the DACO approved list
 */
export default async function () {
  // retrieve approved users list from daco system
  const dacoUsers = await getApprovedUsers();
  // initialize EGA Axios client
  const egaClient = await egaApiClient();

  // retrieve all datasets for ICGC DAC
  const {
    ega: { dacId },
  } = getAppConfig();
  const datasets = await egaClient.getDatasetsForDac(dacId);

  // get datasets failed completely
  if (!isSuccess(datasets)) {
    // TODO: retry here?
    throw new Error('Failed to fetch datasets');
  }
  // retrieve corresponding users in EGA system
  const egaUsers = await getUsers(egaClient, dacoUsers);
  const datasetsRetrieved = datasets.data.success;
  // check DACO approved users have expected EGA permissions for each dataset
  await processPermissionsForApprovedUsers(egaClient, egaUsers, datasetsRetrieved);

  // can add a return value to these process functions if needed, i.e. BatchJobReport

  // Check existing permissions per dataset + revoke if needed
  for await (const dataset of datasetsRetrieved) {
    await processPermissionsForDataset(egaClient, dataset.accession_id, egaUsers);
  }

  logger.info(buildMessage(JOB_NAME, 'Completed.'));
}
