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

import { getAppConfig } from '../../config';
import logger from '../../logger';
import { egaApiClient } from './axios/egaClient';
import {
  processPermissionsForApprovedUsers,
  removeExpiredPermissions,
} from './services/permissions';
import { getEgaUsers } from './services/users';
import { isSuccess } from './types/results';
import { getDacoApprovedUsers } from './utils';

import moment from 'moment';
import { JobReport } from '../types';
import { ReconciliationJobReport } from './types/reports';

const JOB_NAME = 'RECONCILE_EGA_PERMISSIONS';

/**
 * Steps:
 * 1) Retrieve approved users list from dac db
 * 2) Retrieve datasets for DAC
 * 3) Retrieve corresponding list of users from EGA API
 * 4) Create permissions, on each dataset, for each user on the DACO approved list, if no existing permission is found
 * 5) Process existing permissions for each dataset + revoke those which belong to users not on the DACO approved list
 * 6) Return completed JobReport
 * @returns Promise<JobReport<ReconciliationJobReport>>
 */
async function runEgaPermissionsReconciliation(): Promise<JobReport<ReconciliationJobReport>> {
  const startTime = new Date();

  // retrieve approved users list from daco system
  const dacoUsers = await getDacoApprovedUsers();

  // initialize EGA Axios client
  const egaClient = await egaApiClient();

  // retrieve all datasets for ICGC DAC
  const {
    ega: { dacId },
  } = getAppConfig();
  const datasets = await egaClient.getDatasetsForDac(dacId);

  // get datasets failed completely - not recoverable
  if (!isSuccess(datasets)) {
    logger.error(`${JOB_NAME} - Failed to fetch datasets, aborting.`);
    const jobFailureReport: JobReport<ReconciliationJobReport> = {
      startedAt: startTime,
      finishedAt: new Date(),
      jobName: JOB_NAME,
      success: false,
      error: datasets.message,
      details: {
        approvedDacoUsersCount: dacoUsers.length,
        approvedEgaUsersCount: 0,
        datasetsCount: 0,
        permissionsCreated: 0,
        permissionsRevoked: 0,
      },
    };
    return jobFailureReport;
  }

  logger.debug(
    `${JOB_NAME} - Successfully retrieved ${datasets.data.success.length} for DAC ${dacId}.`,
  );
  // retrieve corresponding users in EGA system
  const egaUsers = await getEgaUsers(egaClient, dacoUsers);
  logger.debug(`${JOB_NAME} - Completed fetching users`);
  logger.debug(
    `${JOB_NAME} - Retrieved ${Object.keys(egaUsers).length} corresponding users from EGA.`,
  );
  const datasetsRetrieved = datasets.data.success;
  logger.debug(`${JOB_NAME} - Retrieved ${datasetsRetrieved.length} datasets for ${dacId}.`);

  // check DACO approved users have expected EGA permissions for each dataset
  const permissionsCreatedResult = await processPermissionsForApprovedUsers(
    egaClient,
    egaUsers,
    datasetsRetrieved,
  );

  // remove any expired permissions for each dataset
  const permissionsRevokedResult = await removeExpiredPermissions(
    egaClient,
    egaUsers,
    datasetsRetrieved,
  );

  const endTime = new Date();
  const timeElapsed = moment(endTime).diff(startTime, 'minutes');
  logger.info(`${JOB_NAME} - Job took ${timeElapsed} minutes to complete.`);

  const reportHasErrors =
    permissionsCreatedResult.details.errors.length | permissionsRevokedResult.details.errors.length;
  const permissionsReconciliationJobReport: JobReport<ReconciliationJobReport> = {
    startedAt: startTime,
    finishedAt: endTime,
    jobName: JOB_NAME,
    success: !reportHasErrors,
    error: reportHasErrors ? 'Completed, with some errors' : undefined,
    details: {
      approvedDacoUsersCount: dacoUsers.length,
      approvedEgaUsersCount: Object.keys(egaUsers).length,
      datasetsCount: datasetsRetrieved.length,
      permissionsCreated: permissionsCreatedResult,
      permissionsRevoked: permissionsRevokedResult,
    },
  };
  return permissionsReconciliationJobReport;
}

export default runEgaPermissionsReconciliation;
