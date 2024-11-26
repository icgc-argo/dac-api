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
import moment from 'moment';
import logger from '../../../logger';
import { EgaClient } from '../axios/egaClient';
import { DatasetAccessionId } from '../types/common';
import { DEFAULT_LIMIT, DEFAULT_OFFSET, EGA_MAX_REQUEST_SIZE } from '../types/constants';
import {
  CompletionStatus,
  DatasetPermissionsRevocationResult,
  PermissionProcessingError,
  PermissionsCreatedPerUserResult,
  ProcessApprovedUsersDetails,
  ProcessExpiredPermissionsDetails,
  ProcessResultReport,
} from '../types/reports';
import { PermissionRequest, RevokePermission } from '../types/requests';
import { EgaDacoUser, EgaDacoUserMap, EgaDataset } from '../types/responses';
import { isSuccess } from '../types/results';
import {
  createPermissionApprovalRequest,
  createPermissionRequest,
  createRevokePermissionRequest,
} from '../utils';

/**
 * Parse completionStatus for a reconciliation step, based on the number of successfully processed items vs total expected
 * Any errors during a step will result in a FAILURE status
 * SUCCESS = no errors, and totalProcessed count matches totalExpected count
 * INCOMPLETE = no errors, but totalProcessed count does not match totalExpected count
 * FAILURE = errors occurred during job. Disregards other totals
 * @param errors
 * @param totalProcessed
 * @param totalExpected
 * @returns CompletionStatus
 */
const getCompletionStatus = (
  errors: PermissionProcessingError[],
  totalProcessed: number,
  totalExpected: number,
): CompletionStatus => {
  switch (true) {
    case errors.length > 0:
      return 'FAILURE';
    case errors.length === 0 && totalProcessed === totalExpected:
      return 'SUCCESS';
    case errors.length === 0 && totalProcessed !== totalExpected:
      return 'INCOMPLETE';
    default:
      return 'FAILURE';
  }
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
export const createRequiredPermissions = async (
  egaClient: EgaClient,
  approvedUser: EgaDacoUser,
  requests: PermissionRequest[],
): Promise<{ num_granted: number; error?: PermissionProcessingError }> => {
  // create requests for permissions
  const createRequestsResponse = await egaClient.createPermissionRequests(requests);
  switch (createRequestsResponse.status) {
    case 'SUCCESS':
      if (createRequestsResponse.data.success.length) {
        // if permissions request successfully created, approve them
        const approvalRequests = createRequestsResponse.data.success.map((request) =>
          createPermissionApprovalRequest(request.request_id, approvedUser.appExpiry),
        );
        const approvePermissionRequestsResponse = await egaClient.approvePermissionRequests(
          approvalRequests,
        );
        if (isSuccess(approvePermissionRequestsResponse)) {
          const {
            data: { num_granted },
          } = approvePermissionRequestsResponse;
          return { num_granted };
        } else {
          logger.error(
            `ApprovalRequests failed due to: ${approvePermissionRequestsResponse.message}`,
          );
          return {
            num_granted: 0,
            error: {
              processName: 'approvePermissionRequests',
              status: approvePermissionRequestsResponse.status,
              message: approvePermissionRequestsResponse.message,
            },
          };
        }
      }
      if (createRequestsResponse.data.failure.length) {
        // if there are failures, report them
        logger.error(
          `Failures from create permission requests: ${createRequestsResponse.data.failure}`,
        );
        return {
          num_granted: 0,
          error: {
            processName: 'createPermissionRequests',
            message: 'Some permissions requests were not created',
            status: 'PARSING_FAILURE',
          },
        };
      }
      break;
    case 'SERVER_ERROR':
    default:
      logger.error(
        `Request to create PermissionRequests failed due to: ${createRequestsResponse.message}`,
      );
      return {
        num_granted: 0,
        error: {
          processName: 'createPermissionRequests',
          status: createRequestsResponse.status,
          message: createRequestsResponse.message,
        },
      };
  }
  return { num_granted: 0 };
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
): Promise<ProcessResultReport<ProcessApprovedUsersDetails>> => {
  const startTime = new Date();
  const userList = Object.values(egaUsers);

  const totalCreatedPermissionsResult: ProcessApprovedUsersDetails = {
    numUsersSuccessfullyProcessed: 0,
    numUsersWithNewPermissions: 0,
    errors: [],
  };
  for await (const approvedUser of userList) {
    logger.info(
      `Checking permissions for user ${approvedUser.username} - userId: [${approvedUser.id}]`,
    );
    const permissionRequests: PermissionRequest[] = [];
    const userPermissionResult: PermissionsCreatedPerUserResult = {
      permissionsMissingCount: 0,
      permissionsGrantedCount: 0,
    };
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
          // if a dataset is removed from the incoming datasets list argument, i.e. the user has more dataset permissions than the incoming list,
          // the call to difference() here would still return an empty array
          // const incomingDatasetList = [1, 2, 3, 4, 6];
          // const existingDatasetListForUser = [1, 2, 3, 4, 5]; // list with now defunct datasetId
          // const response = difference(one, two) => [6]
          const missingDatasetIds = difference(
            datasetsRequiringPermissions,
            datasetsWithPermissions,
          );
          userPermissionResult.permissionsMissingCount = missingDatasetIds.length;
          missingDatasetIds.map((datasetId: DatasetAccessionId) => {
            // create permission request, add to requestList
            // TODO: looks like username MUST be in email format, the one-name usernames in the test env fail (silently, an empty array is returned by createPermissionRequests)
            const permissionRequest = createPermissionRequest(approvedUser.username, datasetId);
            permissionRequests.push(permissionRequest);
          });
        }
        break;
      case 'SERVER_ERROR':
      default:
        logger.error(`Error fetching existing permission: ${existingPermission.message}`);
        totalCreatedPermissionsResult.errors.push({
          processName: 'getPermissionsByUserId',
          message: existingPermission.message,
          status: existingPermission.status,
        });
    }

    if (permissionRequests.length) {
      const chunkedPermissionRequests = chunk(permissionRequests, EGA_MAX_REQUEST_SIZE);
      for await (const requests of chunkedPermissionRequests) {
        const createdPermissions = await createRequiredPermissions(
          egaClient,
          approvedUser,
          requests,
        );
        if (createdPermissions.num_granted !== 0) {
          userPermissionResult.permissionsGrantedCount =
            userPermissionResult.permissionsGrantedCount + createdPermissions.num_granted;
          totalCreatedPermissionsResult.numUsersWithNewPermissions++;
        }
      }
    }

    if (
      userPermissionResult.permissionsGrantedCount === userPermissionResult.permissionsMissingCount
    ) {
      totalCreatedPermissionsResult.numUsersSuccessfullyProcessed++;
    }
  }

  logger.info('Completed processing permissions for all DACO approved users.');
  const endTime = new Date();
  const timeElapsed = moment(endTime).diff(startTime, 'minutes');

  return {
    startTime,
    endTime,
    timeElapsed: `${timeElapsed} minutes`,
    completionStatus: getCompletionStatus(
      totalCreatedPermissionsResult.errors,
      totalCreatedPermissionsResult.numUsersSuccessfullyProcessed,
      Object.keys(egaUsers).length,
    ),
    details: totalCreatedPermissionsResult,
  };
};

/**
 * Paginates through all permissions for a dataset and revokes permissions for users not found in approvedUsers
 * @param client EgaClient
 * @param dataset_accession_id DatasetAccessionId
 * @param approvedUsers EgaDacoUserMap
 * @returns DatasetPermissionsRevocationResult
 */
export const processPermissionsForDataset = async (
  client: EgaClient,
  datasetAccessionId: DatasetAccessionId,
  approvedUsers: EgaDacoUserMap,
): Promise<DatasetPermissionsRevocationResult> => {
  let permissionsSet: Set<number> = new Set();
  let permissionsToRevoke: RevokePermission[] = [];
  let offset = 0;
  let limit = DEFAULT_LIMIT;
  let paging = true;
  let totalExistingPermissions = 0;
  const permissionsRevocationResult: DatasetPermissionsRevocationResult = {
    permissionRevocationsExpected: 0,
    permissionRevocationsCompleted: 0,
    hasIncorrectPermissionsCount: false,
    errors: [],
  };
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
      totalExistingPermissions = totalExistingPermissions + permissionsSuccesses.length;
      paging = totalResults === limit;
      offset = offset + DEFAULT_OFFSET;
    } else {
      logger.error(
        `GET permissions for dataset ${datasetAccessionId} failed - ${permissions.message}`,
      );
      permissionsRevocationResult.errors.push({
        processName: 'getPermissionsForDataset',
        status: permissions.status,
        message: permissions.message,
        datasetId: datasetAccessionId,
      });
      // TODO: add a max number of retries to prevent endless loop, then set paging = false?
    }
  }
  const setSize = permissionsSet.size;
  permissionsRevocationResult.permissionRevocationsExpected = setSize;
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
        permissionsRevocationResult.permissionRevocationsCompleted =
          permissionsRevocationResult.permissionRevocationsCompleted +
          revokeResponse.data.num_revoked;
      } else {
        logger.error(
          `There was an error revoking permissions for DATASET ${datasetAccessionId} - ${revokeResponse.message}.`,
        );
        permissionsRevocationResult.errors.push({
          processName: 'revokePermissions',
          status: revokeResponse.status,
          message: revokeResponse.message,
          datasetId: datasetAccessionId,
        });
      }
    }
  } else {
    logger.debug(`There are no permissions to revoke for DATASET ${datasetAccessionId}.`);
  }

  const datasetHasCorrectPermissionsCount =
    totalExistingPermissions - permissionsRevocationResult.permissionRevocationsCompleted ===
    Object.keys(approvedUsers).length;
  permissionsRevocationResult.hasIncorrectPermissionsCount = !datasetHasCorrectPermissionsCount;

  return permissionsRevocationResult;
};

/**
 * Remove expired permissions from each Dataset in the ICGC DAC.
 * Permissions are considered expired if the associated username is not found on the EgaUsers list
 * Returns a report detailing the number of datasets successfully process, and any errors encountered.
 * A dataset is considered successfully processed if the number of expected revoked permissions matches the number that are revoked
 * @param egaClient
 * @param egaUsers
 * @param datasets
 * @returns Promise<ProcessResultReport<ProcessExpiredPermissionsDetails>>
 */
export const removeExpiredPermissions = async (
  client: EgaClient,
  egaUsers: EgaDacoUserMap,
  datasets: EgaDataset[],
): Promise<ProcessResultReport<ProcessExpiredPermissionsDetails>> => {
  const startTime = new Date();
  // Check existing permissions per dataset + revoke if needed
  const revocationErrors: PermissionProcessingError[] = [];
  const permissionsRevokedResult: ProcessExpiredPermissionsDetails = {
    numDatasetsProcessed: 0,
    numDatasetsWithPermissionsRevoked: 0,
    errors: revocationErrors,
    datasetsWithIncorrectPermissionsCounts: [],
  };
  for await (const dataset of datasets) {
    const result = await processPermissionsForDataset(client, dataset.accession_id, egaUsers);
    if (result.permissionRevocationsCompleted > 0) {
      permissionsRevokedResult.numDatasetsWithPermissionsRevoked++;
    }
    if (result.permissionRevocationsCompleted === result.permissionRevocationsExpected) {
      permissionsRevokedResult.numDatasetsProcessed++;
    } else {
      permissionsRevokedResult.errors.concat(result.errors);
    }
    if (result.hasIncorrectPermissionsCount) {
      permissionsRevokedResult.datasetsWithIncorrectPermissionsCounts.concat(dataset.accession_id);
    }
  }
  const endTime = new Date();
  const timeElapsed = moment(endTime).diff(startTime, 'minutes');

  // datasets with permissions counts that do not match the number of approved users are not "successfully processed"
  const datasetsSuccessfullyProcessed =
    permissionsRevokedResult.numDatasetsProcessed -
    permissionsRevokedResult.datasetsWithIncorrectPermissionsCounts.length;

  return {
    startTime,
    endTime,
    timeElapsed: `${timeElapsed} minutes`,
    completionStatus: getCompletionStatus(
      permissionsRevokedResult.errors,
      datasetsSuccessfullyProcessed,
      datasets.length,
    ),
    details: {
      numDatasetsProcessed: permissionsRevokedResult.numDatasetsProcessed,
      numDatasetsWithPermissionsRevoked: permissionsRevokedResult.numDatasetsWithPermissionsRevoked,
      errors: permissionsRevokedResult.errors,
      datasetsWithIncorrectPermissionsCounts:
        permissionsRevokedResult.datasetsWithIncorrectPermissionsCounts,
    },
  };
};
