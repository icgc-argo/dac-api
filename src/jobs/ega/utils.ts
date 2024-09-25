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

import { uniqBy } from 'lodash';
import { UserDataFromApprovedApplicationsResult } from '../../domain/interface';
import { getUsersFromApprovedApps } from '../../domain/service/applications/search';
import { DatasetAccessionId } from './types/common';
import { PermissionRequest, RevokePermission } from './types/requests';

export type ApprovedUser = {
  username: string;
  email: string;
  affiliation: string;
  appExpiry: Date;
};

/**
 * Extracts fields necessary for EGA permissions flow from applicant and collaborators in an application
 * @param applicationData UserDataFromApprovedApplicationsResult
 * @returns ApprovedUser[]
 */
const parseApprovedUsersForApplication = (
  applicationData: UserDataFromApprovedApplicationsResult,
): ApprovedUser[] => {
  const applicantInfo = applicationData.applicant.info;
  const applicant = {
    username: applicantInfo.displayName,
    email: applicantInfo.institutionEmail,
    affiliation: applicantInfo.primaryAffiliation,
    appExpiry: applicationData.expiresAtUtc,
  };
  const collabs = (applicationData.collaborators.list || []).map((collab) => ({
    username: collab.info.displayName,
    email: collab.info.institutionEmail,
    affiliation: collab.info.primaryAffiliation,
    appExpiry: applicationData.expiresAtUtc,
  }));

  return [applicant, ...collabs].flat();
};

/**
 * Retrieves applicant and collaborator information from all currently approved applications
 * @returns Promise<ApprovedUser[]>
 */
export const getApprovedUsers = async () => {
  const results = await getUsersFromApprovedApps();
  const parsedUsers = results.map((app) => parseApprovedUsersForApplication(app)).flat();
  return uniqBy(parsedUsers, 'email');
};

// Utils

/**
 * Create Ega permission request object for POST /requests
 * @param username
 * @param dataset_accession_id
 * @returns PermissionRequest
 */
const createPermissionRequest = (
  username: string,
  datasetAccessionId: DatasetAccessionId,
): PermissionRequest => {
  return {
    username,
    dataset_accession_id: datasetAccessionId,
    request_data: {
      comment: 'Access granted by ICGC DAC',
    },
  };
};

/**
 * Create revoke permission request object for DELETE /requests
 * @param permissionId
 * @returns RevokePermissionRequest
 */
const createRevokePermissionRequest = (permissionId: number): RevokePermission => {
  return {
    id: permissionId,
    reason: 'ICGC DAC access has expired.',
  };
};

/**
 * Checks if error arg is of type Error, and returns err.message if so; otherwise returns defaultMessage arg
 * Used in catch block of try/catch, where type of error in catch is unknown
 * @param error unknown
 * @param defaultMessage string
 * @returns string
 */
export const getErrorMessage = (error: unknown, defaultMessage: string): string =>
  error instanceof Error ? error.message : defaultMessage;
