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

import { DatasetAccessionId, EgaUserId } from './common';

type ProcessErrorStatus =
  | 'SERVER_ERROR'
  | 'INVALID_APPROVE_PERMISSION_REQUESTS_RESPONSE'
  | 'INVALID_REVOKE_PERMISSIONS_RESPONSE'
  | 'PERMISSION_DOES_NOT_EXIST'
  | 'NOT_FOUND'
  | 'INVALID_USER'
  | 'PARSING_FAILURE';

export type PermissionProcessingError = {
  message: string;
  processName: string;
  status: ProcessErrorStatus;
};

/* ******************* *
   Revoke permissions types
 * ******************* */

export type DatasetPermissionsRevocationResult = {
  permissionRevocationsExpected: number;
  permissionRevocationsCompleted: number;
  hasIncorrectPermissionsCount: boolean;
  errors: (PermissionProcessingError & { datasetId: DatasetAccessionId })[];
};

export type ProcessExpiredPermissionsDetails = {
  numDatasetsProcessed: number;
  numDatasetsWithPermissionsRevoked: number;
  errors: PermissionProcessingError[];
  datasetsWithIncorrectPermissionsCounts: DatasetAccessionId[];
};
/* ******************* *
   Create permissions types
 * ******************* */

export type PermissionsCreatedPerUserResult = {
  permissionsMissingCount: number;
  permissionsGrantedCount: number;
};

export type ProcessApprovedUsersDetails = {
  numUsersSuccessfullyProcessed: number;
  numUsersWithNewPermissions: number;
  errors: PermissionProcessingError[];
};

/* ******************* *
    Main Permissions Report types
 * ******************* */

export type CompletionStatus = 'SUCCESS' | 'FAILURE' | 'INCOMPLETE';

export type ProcessResultReport<T> = {
  startTime: Date;
  endTime: Date;
  timeElapsed: string;
  completionStatus: CompletionStatus;
  details: T;
};

export type PermissionsProcessingResults = {
  permissionsCreated: ProcessResultReport<ProcessApprovedUsersDetails>;
  permissionsRevoked: ProcessResultReport<ProcessExpiredPermissionsDetails>;
};

export type ReconciliationJobReportCompleted = {
  approvedDacoUsersCount: number;
  approvedEgaUsersCount: number;
  datasetsCount: number;
} & PermissionsProcessingResults;

export type ReconciliationJobReportFailure = {
  approvedDacoUsersCount: number;
  approvedEgaUsersCount: 0;
  datasetsCount: 0;
  permissionsCreated: 0;
  permissionsRevoked: 0;
};

export type ReconciliationJobReport =
  | ReconciliationJobReportCompleted
  | ReconciliationJobReportFailure;
