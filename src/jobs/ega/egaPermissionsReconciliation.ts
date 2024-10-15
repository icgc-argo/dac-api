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
import logger, { buildMessage } from '../../logger';
import { egaApiClient } from './egaClient';
import {
  processPermissionsForApprovedUsers,
  processPermissionsForDataset,
} from './services/permissions';
import { getEgaUsers } from './services/users';
import { isSuccess } from './types/results';
import { getDacoApprovedUsers } from './utils';

import moment from 'moment';

const JOB_NAME = 'RECONCILE_EGA_PERMISSIONS';

/**
 * Steps:
 * 1) Retrieve approved users list from dac db
 * 2) Retrieve datasets for DAC
 * 3) Retrieve corresponding list of users from EGA API
 * 4) Create permissions, on each dataset, for each user on the DACO approved list, if no existing permission is found
 * 5) Process existing permissions for each dataset + revoke those which belong to users not on the DACO approved list
 */
async function runEgaPermissionsReconciliation() {
  const startTime = new Date();
  logger.info(`Job started at ${startTime}`);
  // retrieve approved users list from daco system
  const dacoUsers = await getDacoApprovedUsers();
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
  const egaUsers = await getEgaUsers(egaClient, dacoUsers);
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
  const endTime = new Date();
  logger.info(`Job completed at ${endTime}`);
  const timeElapsed = moment(endTime).diff(startTime, 'minutes');
  logger.info(`Job took ${timeElapsed} minutes to complete.`);
  return 'OK';
}

export default runEgaPermissionsReconciliation;
