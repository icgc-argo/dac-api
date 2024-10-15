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

import { chunk, difference } from 'lodash';
import logger from '../../../logger';
import { EgaClient } from '../egaClient';
import { DatasetAccessionId } from '../types/common';
import { DEFAULT_LIMIT, DEFAULT_OFFSET, EGA_MAX_REQUEST_SIZE } from '../types/constants';
import { PermissionRequest, RevokePermission } from '../types/requests';
import { EgaDacoUser, EgaDacoUserMap, EgaDataset } from '../types/responses';
import { isSuccess } from '../types/results';
import {
  createPermissionApprovalRequest,
  createPermissionRequest,
  createRevokePermissionRequest,
} from '../utils';

/**
 * Function to create + approve a list of PermissionsRequests
 *  1) Sends requests to POST /requests to create a PermissionRequest for each item
 *  2) Creates an ApprovePermissionRequest for each PermissionRequest received in the list response from (1)
 *  3) Sends all ApprovePermissionRequests to PUT /requests
 * @param egaClient EgaClient
 * @param approvedUser EgaDacoUser
 * @param permissionRequests PermissionRequest[]
 */
export const createRequiredPermissions = async (
  egaClient: EgaClient,
  approvedUser: EgaDacoUser,
  requests: PermissionRequest[],
): Promise<number | undefined> => {
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
          return approvePermissionRequestsResponse.data.num_granted;
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
 *  a) query GET /permissions endpoint by userId + limit=total number of datasets for ICGC DAC, to get all permissions for a user
 *  b) compare the datasetIds in the result from a) with the list of datasets included with the ICGC DAC, and create an array of the missing ids
 *  c) create a PermissionRequest object for each datasetId in b) and add to permissionsRequest list
 * 2) If there are items in the permissionsRequest list:
 *  a) Divides requests into EGA_MAX_REQUEST_SIZE chunks
 *  b) For each chunk, create permissions with createRequiredPermissions()
 * @param egaClient
 * @param egaUsers
 * @param datasets
 */
export const processPermissionsForApprovedUsers = async (
  egaClient: EgaClient,
  egaUsers: EgaDacoUserMap,
  datasets: EgaDataset[],
) => {
  const userList = Object.values(egaUsers);
  for await (const approvedUser of userList) {
    const permissionRequests: PermissionRequest[] = [];
    const existingPermission = await egaClient.getPermissionsByUserId(
      approvedUser.id,
      datasets.length,
    );
    switch (existingPermission.status) {
      case 'SUCCESS':
        if (existingPermission.data.success.length) {
          const datasetsWithPermissions = existingPermission.data.success.map(
            (perm) => perm.dataset_accession_id,
          );
          const datasetsRequiringPermissions = datasets.map((dataset) => dataset.accession_id);
          const missingDatasetIds = difference(
            datasetsRequiringPermissions,
            datasetsWithPermissions,
          );
          missingDatasetIds.map((datasetId: DatasetAccessionId) => {
            // create permission request, add to requestList
            // TODO: looks like username MUST be in email format, the one-name usernames in the test env fail (silently, an empty array is returned by createPermissionRequests)
            const permissionRequest = createPermissionRequest(approvedUser.username, datasetId);
            permissionRequests.push(permissionRequest);
          });
        }
        break;
      case 'SERVER_ERROR':
        logger.info(`Error fetching existing permission: ${existingPermission.message}`);
        break;
      default:
        logger.error(`Unexpected error fetching existing permission: ${existingPermission}`);
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
      offset = offset + DEFAULT_OFFSET;
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
    logger.debug(`There are ${setSize} permissions to remove.`);
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
