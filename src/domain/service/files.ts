/*
 * Copyright (c) 2022 The Ontario Institute for Cancer Research. All rights reserved
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

import { Identity } from '@overture-stack/ego-token-middleware';
import { UploadedFile } from 'express-fileupload';
import nodemail from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import moment from 'moment';
import 'moment-timezone';
import { uniqBy } from 'lodash';

import { getAppConfig } from '../../config';
import { ApplicationDocument, ApplicationModel } from '../model';
import { ApplicationStateManager } from '../state';
import {
  Application,
  ApplicationUpdate,
  ApprovedUserRowData,
  ColumnHeader,
  PersonalInfo,
  UploadDocumentType,
  UserDataFromApprovedApplicationsResult,
} from '../interface';
import { Storage } from '../../storage';
import logger, { buildNamedLog } from '../../logger';
import { hasReviewScope } from '../../utils/permissions';
import {
  findApplication,
  getApplicationUpdates,
  getUsersFromApprovedApps,
} from './applications/search';
import { sendEthicsLetterSubmitted } from './emails';
import { c } from '../../utils/misc';
import { sortByDate } from '../../utils/calculations';

export async function deleteDocument(
  appId: string,
  type: UploadDocumentType,
  objectId: string,
  identity: Identity,
  storageClient: Storage,
) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.deleteDocument(
    objectId,
    type,
    identity.userId,
    isAdminOrReviewerResult,
  );
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  await storageClient.delete(objectId);
  const updated = await findApplication(c(result.appId), identity);
  const viewAbleApplication = new ApplicationStateManager(
    updated.toObject(),
  ).prepareApplicationForUser(false);
  return viewAbleApplication;
}

export async function uploadDocument(
  appId: string,
  type: UploadDocumentType,
  file: UploadedFile,
  identity: Identity,
  storageClient: Storage,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const config = getAppConfig();
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;

  let existingId: string | undefined = undefined;
  if (type == 'SIGNED_APP') {
    existingId = appDocObj.sections.signature.signedAppDocObjId;
  }

  if (type === 'APPROVED_PDF') {
    const currentDoc = appDocObj.approvedAppDocs.find((doc) => doc.isCurrent);
    // if the approvedAtUtc of the doc that is marked isCurrent matches the app-level approvedAtUtc,
    // the assumption is that this uploaded doc should replace the current approved doc
    existingId =
      currentDoc && currentDoc.approvedAtUtc === appDocObj.approvedAtUtc
        ? currentDoc.approvedAppDocObjId
        : undefined;
  }

  const id = await storageClient.upload(file, existingId);
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.addDocument(
    id,
    file.name,
    type,
    identity.userId,
    isAdminOrReviewerResult,
  );
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  const updated = await findApplication(c(result.appId), identity);

  if (updated.state == 'APPROVED') {
    if (type == 'ETHICS') {
      sendEthicsLetterSubmitted(updated, config, emailClient);
    }
  }

  const viewAbleApplication = new ApplicationStateManager(
    updated.toObject(),
  ).prepareApplicationForUser(false);
  return viewAbleApplication;
}

export async function getApplicationAssetsAsStream(
  appId: string,
  identity: Identity,
  storageClient: Storage,
) {
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;

  if (
    appDocObj.state !== 'REVIEW' &&
    appDocObj.state !== 'APPROVED' &&
    // can download assets if app is CLOSED but was APPROVED.
    !(appDocObj.state === 'CLOSED' && appDocObj.approvedAtUtc) &&
    appDocObj.state !== 'REJECTED'
  ) {
    throw new Error('Cannot download package in this state');
  }

  const docs = appDocObj.sections.ethicsLetter.approvalLetterDocs.map((e) => ({
    id: e.objectId,
    name: e.name,
  }));

  docs.push({
    name: appDocObj.sections.signature.signedDocName,
    id: appDocObj.sections.signature.signedAppDocObjId,
  });

  const currentApprovedAppDoc = appDocObj.approvedAppDocs.find((pdfDoc) => pdfDoc.isCurrent);
  if (currentApprovedAppDoc) {
    docs.push({
      name: currentApprovedAppDoc.approvedAppDocName,
      id: currentApprovedAppDoc.approvedAppDocObjId,
    });
  }

  // get the assets as streams from the response bodies
  const downloaded = docs.map(async (d) => {
    const stream = await storageClient.downloadAsStream(d.id);
    return {
      ...d,
      stream,
    };
  });
  const assets = await Promise.all(downloaded);
  logger.info(`Returning all assets for ${appId} as stream.`);
  return assets;
}

export const createAppHistoryTSV = async () => {
  const results = await getApplicationUpdates();
  const sortedUpdates = results
    .map((app: ApplicationDocument) => {
      return (app.updates as ApplicationUpdate[]).map((update: ApplicationUpdate) => {
        return {
          appId: app.appId,
          daysElapsed: update.daysElapsed,
          institution: update.applicationInfo.institution,
          country: update.applicationInfo.country,
          applicant: update.applicationInfo.applicant,
          projectTitle: update.applicationInfo.projectTitle,
          appType: update.applicationInfo.appType,
          ethicsLetterRequired:
            update.applicationInfo.ethicsLetterRequired === null
              ? ''
              : update.applicationInfo.ethicsLetterRequired
              ? 'Yes'
              : 'No',
          eventType: update.eventType,
          role: update.author.role,
          date: update.date,
        };
      });
    })
    .flat()
    .sort(sortByDate);

  const appHistoryTSVColumns: ColumnHeader[] = [
    { name: 'Application #', accessor: 'appId' },
    {
      name: 'Date of Status Change',
      accessor: 'date',
      format: (value: string) => moment(value).format('YYYY-MM-DD'),
    },
    { name: 'Status', accessor: 'eventType' },
    { name: 'Type', accessor: 'appType' },
    { name: 'Action Performed By', accessor: 'role' },
    { name: 'Days Since Last Status Change', accessor: 'daysElapsed' },
    { name: 'Institution', accessor: 'institution' },
    { name: 'Country', accessor: 'country' },
    { name: 'Applicant', accessor: 'applicant' },
    { name: 'Project Title', accessor: 'projectTitle' },
    { name: 'Ethics Letter', accessor: 'ethicsLetterRequired' },
  ];

  const headerRow: string = appHistoryTSVColumns.map((header) => header.name).join('\t');
  const tsvRows = sortedUpdates.map((row: any) => {
    const dataRow: string[] = appHistoryTSVColumns.map((header) => {
      if (header.format) {
        return header.format(row[header.accessor as string]);
      }
      return row[header.accessor as string];
    });
    return dataRow.join('\t');
  });

  return [headerRow, ...tsvRows].join('\n');
};

function getUserChangedDate(
  appData: UserDataFromApprovedApplicationsResult,
  section: 'applicant' | 'collaborators',
): Date {
  return appData[section].meta.lastUpdatedAtUtc || appData.lastUpdatedAtUtc || new Date();
}

const parseApprovedUser = (
  userInfo: PersonalInfo,
  lastUpdatedAtUtc: Date,
): ApprovedUserRowData => ({
  userName: userInfo.displayName,
  openId: userInfo.googleEmail,
  email: userInfo.institutionEmail,
  affiliation: userInfo.primaryAffiliation,
  changed: moment(lastUpdatedAtUtc).format('YYYY-MM-DDTHH:mm'), // simple formatting until value of this field is verified
});

export const createDacoCSVFile = async (jobName?: string): Promise<string> => {
  logger.info(
    buildNamedLog(
      `Fetching applicant and collaborator info from all approved applications.`,
      jobName,
    ),
  );
  const results = await getUsersFromApprovedApps();
  const approvedAppsCount = results.length;
  // applicant + collaborators get daco access
  logger.info(
    buildNamedLog(
      `Found applicant and collaborator info from ${approvedAppsCount} approved applications.`,
      jobName,
    ),
  );
  logger.info(buildNamedLog(`Parsing user info results.`, jobName));
  const parsedResults = results
    .map((appResult) => {
      const applicantInfo = appResult.applicant.info;
      const applicant = parseApprovedUser(
        applicantInfo,
        getUserChangedDate(appResult, 'applicant'),
      );
      const collabs = (appResult.collaborators.list || []).map((collab) =>
        parseApprovedUser(collab.info, getUserChangedDate(appResult, 'collaborators')),
      );
      return [applicant, ...collabs];
    })
    .flat();

  logger.info(
    buildNamedLog(
      `Parsed info for ${parsedResults.length} users from ${approvedAppsCount} applications.`,
      jobName,
    ),
  );
  const fileHeaders: ColumnHeader[] = [
    { accessor: 'userName', name: 'USER NAME' },
    { accessor: 'openId', name: 'OPENID' },
    { accessor: 'email', name: 'EMAIL' },
    { accessor: 'changed', name: 'CHANGED' },
    { accessor: 'affiliation', name: 'AFFILIATION' },
  ];
  const headerRow: string[] = fileHeaders.map((header) => header.name);

  logger.info(buildNamedLog(`De-duplicating approved users list.`, jobName));
  const uniqueApprovedUsers = uniqBy(parsedResults, 'openId');
  logger.info(
    buildNamedLog(
      `Retrieved ${uniqueApprovedUsers.length} unique approved users from ${approvedAppsCount} applications.`,
      jobName,
    ),
  );
  const approvedUsersRows = uniqueApprovedUsers.map((row: any) => {
    const dataRow: string[] = fileHeaders.map((header) => {
      // if value is missing, add empty string so the column has content
      return row[header.accessor as string] || '';
    });
    return dataRow.join(',');
  });

  return [headerRow, ...approvedUsersRows].join('\n');
};
