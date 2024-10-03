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

import { chunk } from 'lodash';
import { getAppConfig } from '../config';
import logger, { buildMessage } from '../logger';
import { egaApiClient, EgaClient } from './ega/egaClient';
import { DatasetAccessionId } from './ega/types/common';
import { PermissionRequest, RevokePermission } from './ega/types/requests';
import { Dataset, EgaDacoUser, EgaDacoUserMap } from './ega/types/responses';
import { isSuccess } from './ega/types/results';
import {
  ApprovedUser,
  createPermissionApprovalRequest,
  createPermissionRequest,
  createRevokePermissionRequest,
  getApprovedUsers,
} from './ega/utils';

const JOB_NAME = 'RECONCILE_EGA_PERMISSIONS';

// API request constants
const DEFAULT_OFFSET = 50;
const DEFAULT_LIMIT = 50;
const EGA_MAX_REQUEST_SIZE = 2000;

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
const getUsers = async (
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

/**
 * Function to create + approve a list of PermissionsRequests
 *  1) Sends requests to POST /requests to create a PermissionRequest for each item
 *  2) Creates an ApprovePermissionRequest for each PermissionRequest received in the list response from (1)
 *  3) Sends all ApprovePermissionRequests to PUT /requests
 * @param egaClient EgaClient
 * @param approvedUser EgaDacoUser
 * @param permissionRequests PermissionRequest[]
 */
const createRequiredPermissions = async (
  egaClient: EgaClient,
  approvedUser: EgaDacoUser,
  requests: PermissionRequest[],
) => {
  const createRequestsResponse = await egaClient.createPermissionRequests(requests);
  switch (createRequestsResponse.status) {
    case 'SUCCESS':
      if (createRequestsResponse.data.success.length) {
        const approvalRequests = createRequestsResponse.data.success.map((request) =>
          createPermissionApprovalRequest(request.request_id, approvedUser.appExpiry),
        );
        const approvePermissionRequestsResponse = await egaClient.approvePermissionRequests(
          approvalRequests,
        );
        if (isSuccess(approvePermissionRequestsResponse)) {
          logger.debug(
            `${approvePermissionRequestsResponse.data.num_granted} of ${requests.length} approval requests completed.`,
          );
        } else {
          logger.error(
            `ApprovalRequests failed due to: ${approvePermissionRequestsResponse.message}`,
          );
        }
      } else {
        console.log(
          `Failures from create permission requests`,
          createRequestsResponse.data.failure,
        );
      }
      break;
    case 'SERVER_ERROR':
    default:
      logger.error(
        `Request to create PermissionRequests failed due to: ${createRequestsResponse.message}`,
      );
  }
};

/**
 * Process any missing permissions for all users on DACO ApprovedList, for each Dataset in the ICGC DAC
 * Iterates through each user:
 * 1) For each dataset:
 *  a) queries GET dacs/{dacId}/permissions endpoint by datasetAccessionId + userId
 *  b) If no permission is found, creates PermissionRequest object and adds to permissionsRequest list
 * 2) If there are items in the permissionsRequest list, divides requests into EGA_MAX_REQUEST_SIZE chunks
 *  a) For each chunk, creates permissions with createRequiredPermissions() call
 * @param egaClient
 * @param egaUsers
 * @param datasets
 */
const processPermissionsForApprovedUsers = async (
  egaClient: EgaClient,
  egaUsers: EgaDacoUserMap,
  datasets: Dataset[],
) => {
  const userList = Object.values(egaUsers);
  for await (const approvedUser of userList) {
    const permissionRequests: PermissionRequest[] = [];
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
      } else {
        logger.info(`Error fetching existing permission: ${existingPermission.message}`);
      }
    }
    if (permissionRequests.length) {
      const chunkedPermissionRequests = chunk(permissionRequests, EGA_MAX_REQUEST_SIZE);
      for await (const requests of chunkedPermissionRequests) {
        await createRequiredPermissions(egaClient, approvedUser, requests);
      }
    }
  }
  logger.info('Completed processing permissions for all DACO approved users.');
};

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
  let permissionsSet: Set<number> = new Set();
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
          permissionsSet.add(permission.permission_id);
        }
      });
      const totalResults = permissionsFailures.length + permissionsSuccesses.length;
      paging = totalResults === limit;
      // TODO: there is a repeated permission result when paginating,
      // subtracting 1 from the offset prevents paging from stopping before all unique results are retrieved
      offset = offset + DEFAULT_OFFSET - 1;
    } else {
      logger.error(
        `GET permissions for dataset ${datasetAccessionId} failed - ${permissions.message}`,
      );
      // stop paging results if request completely fails to prevent endless loop
      // can a retry mechanism be added here, if error is retryable?
      paging = false;
    }
  }
  const setSize = permissionsSet.size;
  if (setSize > 0) {
    logger.debug(`There are ${permissionsSet.size} permissions to remove.`);
    permissionsSet.forEach((perm) => {
      const revokeReq = createRevokePermissionRequest(perm);
      permissionsToRevoke.push(revokeReq);
    });
    const chunkedRevokeRequests = chunk(permissionsToRevoke, EGA_MAX_REQUEST_SIZE);
    for await (const requests of chunkedRevokeRequests) {
      const revokeResponse = await client.revokePermissions(requests);
      if (isSuccess(revokeResponse)) {
        logger.info(
          `Successfully revoked ${revokeResponse.data.num_revoked} of total ${setSize} permissions for DATASET ${datasetAccessionId}.`,
        );
      } else {
        logger.error(
          `There was an error revoking permissions for DATASET ${datasetAccessionId} - ${revokeResponse.message}.`,
        );
      }
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
async function runEgaPermissionsReconciliation() {
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
  logger.debug(`Successfully retrieved ${datasets.data.success.length} for DAC ${dacId}.`);
  // retrieve corresponding users in EGA system
  const egaUsers = await getUsers(egaClient, dacoUsers);
  logger.debug(`Retrieved ${Object.keys(egaUsers).length} corresponding users from EGA.`);
  const datasetsRetrieved = datasets.data.success;
  logger.debug(`Retrieved ${datasetsRetrieved.length} datasets for ${dacId}.`);
  // check DACO approved users have expected EGA permissions for each dataset
  await processPermissionsForApprovedUsers(egaClient, egaUsers, datasetsRetrieved);

  // can add a return value to these process functions if needed, i.e. BatchJobReport

  // Check existing permissions per dataset + revoke if needed
  for await (const dataset of datasetsRetrieved) {
    await processPermissionsForDataset(egaClient, dataset.accession_id, egaUsers);
  }

  logger.info(buildMessage(JOB_NAME, 'Completed.'));
  return 'OK';
}

export default runEgaPermissionsReconciliation;
