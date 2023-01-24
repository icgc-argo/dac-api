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

import { difference, isEmpty } from 'lodash';
import nodemail from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Identity, UserIdentity } from '@overture-stack/ego-token-middleware';

import { AppConfig, getAppConfig } from '../../../config';
import { ApplicationModel } from '../../model';
import { ApplicationStateManager, getSearchFieldValues, newApplication } from '../../state';
import { Application, UpdateApplication } from '../../interface';
import { Storage } from '../../../storage';
import logger from '../../../logger';
import { checkIsDefined } from '../../../utils/misc';
import {
  sendAttestationReceivedEmail,
  sendReviewEmail,
  sendSubmissionConfirmation,
  sendRevisionsRequestEmail,
  sendRejectedEmail,
  sendApplicationApprovedEmail,
  sendCollaboratorApprovedEmail,
  sendCollaboratorRemovedEmail,
  sendApplicationClosedEmail,
  sendApplicationPausedEmail,
  sendAccessHasExpiredEmail,
} from '../emails';
import { findApplication } from './search';
import { hasReviewScope, getUpdateAuthor } from '../../../utils/permissions';
import { Forbidden, throwApplicationClosedError } from '../../../utils/errors';

export async function create(identity: UserIdentity) {
  const isAdminOrReviewerResult = hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Forbidden('User is not allowed to perform this action');
  }
  const app = newApplication(identity);
  const appDoc = await ApplicationModel.create(app);
  appDoc.appId = `DACO-${appDoc.appNumber}`;
  appDoc.searchValues = getSearchFieldValues(appDoc);
  await appDoc.save();
  const copy = appDoc.toObject();
  const viewableApp = new ApplicationStateManager(copy).prepareApplicationForUser(
    isAdminOrReviewerResult,
  );
  return viewableApp;
}

export async function updatePartial(
  appId: string,
  appPart: Partial<UpdateApplication>,
  identity: Identity,
  storageClient: Storage,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const config = getAppConfig();
  const isReviewer = hasReviewScope(identity);
  const appDoc = await findApplication(checkIsDefined(appId), identity);
  const appDocObj = appDoc.toObject() as Application;

  // if current state is CLOSED, modifications are not allowed
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj);
  const updatedApp = stateManager.updateApp(appPart, isReviewer, getUpdateAuthor(identity));
  await ApplicationModel.updateOne({ appId: updatedApp.appId }, updatedApp);
  const stateChanged = appDocObj.state != updatedApp.state;
  if (stateChanged) {
    await onStateChange(updatedApp, appDocObj, emailClient, config);
  }
  // triggering this here to ensure attestedAtUtc value has been properly updated in the db before sending email
  // cannot rely on stateChanged result because attestation does not imply a state change has occurred
  // i.e. an approved app can be attested and stay in approved state
  const wasAttested = isEmpty(appDocObj.attestedAtUtc) && !!updatedApp.attestedAtUtc;
  if (wasAttested) {
    await sendAttestationReceivedEmail(updatedApp, config, emailClient);
  }

  const deleted = checkDeletedDocuments(appDocObj, updatedApp);
  // Delete orphan documents that are no longer associated with the application in the background
  // this can be a result of application getting updated :
  // - Changing selection of ethics letter from required to not required
  // - Admin requests revisions (signed app has to be uploaded again)
  // - Applicant changes a completed section when the application is in state sign & submit
  deleted.map((d) =>
    storageClient.delete(d).catch((e) => logger.error(`failed to delete document ${d}`, e)),
  );
  const updated = await findApplication(checkIsDefined(updatedApp.appId), identity);
  const updatedObj = updated.toObject();
  const viewableApplication = new ApplicationStateManager(updatedObj).prepareApplicationForUser(
    isReviewer,
  );
  return viewableApplication;
}

export async function onStateChange(
  updatedApp: Application,
  oldApplication: Application,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) {
  // if application state changed to REVIEW (ie submitted) send an email to Admin
  if (updatedApp.state == 'REVIEW') {
    await sendReviewEmail(oldApplication, updatedApp, config, emailClient);

    // send applicant email
    await sendSubmissionConfirmation(updatedApp, emailClient, config);
  }

  if (updatedApp.state == 'REVISIONS REQUESTED') {
    await sendRevisionsRequestEmail(updatedApp, emailClient, config);
  }

  if (updatedApp.state === 'REJECTED') {
    await sendRejectedEmail(updatedApp, emailClient, config);
  }

  // prevent usual approval emails going out when state changes from PAUSED to APPROVED, as this is not a new approval event
  if (updatedApp.state === 'APPROVED' && oldApplication.state !== 'PAUSED') {
    await sendApplicationApprovedEmail(updatedApp, config, emailClient);
    Promise.all(
      updatedApp.sections.collaborators.list.map((collab) => {
        sendCollaboratorApprovedEmail(updatedApp, collab, config, emailClient).catch((err) =>
          logger.error(`failed to send email to collaborator ${collab.id}: ${err}`),
        );
      }),
    ).catch((err) => logger.error(err));
  }

  if (updatedApp.state === 'CLOSED' && oldApplication.state == 'APPROVED') {
    await sendApplicationClosedEmail(updatedApp, config, emailClient);
    Promise.all(
      updatedApp.sections.collaborators.list.map((collab) => {
        sendCollaboratorRemovedEmail(updatedApp, collab, config, emailClient).catch((err) =>
          logger.error(`failed to send email to collaborator ${collab.id}: ${err}`),
        );
      }),
    ).catch((err) => logger.error(err));
  }
  if (updatedApp.state === 'PAUSED') {
    await sendApplicationPausedEmail(updatedApp, config, emailClient);
  }

  if (updatedApp.state === 'EXPIRED') {
    await sendAccessHasExpiredEmail(updatedApp, config, emailClient);
  }
}

function checkDeletedDocuments(appDocObj: Application, result: Application) {
  const removedIds: string[] = [];
  const ethicsArrayBefore = appDocObj.sections.ethicsLetter.approvalLetterDocs
    .sort((a, b) => a.objectId.localeCompare(b.objectId))
    .map((e) => e.objectId);
  const ethicsArrayAfter = result.sections.ethicsLetter.approvalLetterDocs
    .sort((a, b) => a.objectId.localeCompare(b.objectId))
    .map((e) => e.objectId);
  const ethicsDiff = difference(ethicsArrayBefore, ethicsArrayAfter);
  ethicsDiff.forEach((o) => removedIds.push(o));

  if (
    appDocObj.sections.signature.signedAppDocObjId &&
    appDocObj.sections.signature.signedAppDocObjId != result.sections.signature.signedAppDocObjId
  ) {
    removedIds.push(appDocObj.sections.signature.signedAppDocObjId);
  }

  const approvedArrayBefore = appDocObj.approvedAppDocs
    .sort((a, b) => a.approvedAppDocObjId.localeCompare(b.approvedAppDocObjId))
    .map((e) => e.approvedAppDocObjId);
  const approvedArrayAfter = result.approvedAppDocs
    .sort((a, b) => a.approvedAppDocObjId.localeCompare(b.approvedAppDocObjId))
    .map((e) => e.approvedAppDocObjId);
  const approvedDiff = difference(approvedArrayBefore, approvedArrayAfter);
  approvedDiff.forEach((o) => removedIds.push(o));

  logger.info('removing docs: ', removedIds);
  return removedIds;
}
