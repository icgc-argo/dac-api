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

import { difference, isDate } from 'lodash';
import nodemail from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Identity, UserIdentity } from '@overture-stack/ego-token-middleware';

import { AppConfig, getAppConfig } from '../../../config';
import { ApplicationDocument, ApplicationModel } from '../../model';
import {
  ApplicationStateManager,
  renewalApplication,
  getSearchFieldValues,
  newApplication,
  signatureOnlySectionRequiringRevisions,
} from '../../state';
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
  sendCollaboratorEmails,
} from '../emails';
import { isEthicsDocReferenced, findApplication, getById } from './search';
import { hasReviewScope, getUpdateAuthor } from '../../../utils/permissions';
import { Forbidden, throwApplicationClosedError } from '../../../utils/errors';
import {
  isInPreSubmittedState,
  isRenewable,
  renewalPeriodIsEnded,
} from '../../../utils/calculations';
import { FilterQuery } from 'mongoose';

function createAppId(app: Application): string {
  return `DACO-${app.appNumber}`;
}

export async function create(identity: UserIdentity) {
  const isAdminOrReviewerResult = hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Forbidden('User is not allowed to perform this action');
  }
  const app = newApplication(identity);
  const appDoc = await ApplicationModel.create(app);
  appDoc.appId = createAppId(appDoc);
  appDoc.searchValues = getSearchFieldValues(appDoc);
  await appDoc.save();
  const copy = appDoc.toObject();
  const viewableApp = new ApplicationStateManager(copy).prepareApplicationForUser(
    isAdminOrReviewerResult,
  );
  return viewableApp;
}

/**
 * ```
 * Function to remove id connection between an unsubmitted renewal application and its source application when a renewal is CLOSED
 * This is only for renewals that are closed BEFORE the renewal period runs out.
 * Uses a transaction to ensure the applications are unlinked, to allow a new renewal to be created from the source app if necessary
 * ```
 * ```
 * Closing renewals AFTER the renewal period runs out is handled by the 'CLOSING UNSUBMITTED RENEWALS' batch job, and the
 * applications remain linked in that scenario
 * ```
 * @param renewalApp Renewal Application that has already been updated in state
 * @param sourceAppId sourceAppId from original renewal app object
 */
async function unlinkRenewalFromSourceApp(
  renewalApp: Application,
  sourceAppId: string,
  identity: Identity,
): Promise<void> {
  /**
   * Steps:
   * 1) Start session
   * 2) Update renewal application in db - the app obj from the StateManager has already had its state changed to CLOSED, sourceAppId removed and searchValues updated
   * 3) Verify sourceAppId was removed from renewal app doc. If not, throw error and rollback
   * 4) Fetch the source application by sourceAppId
   * 5) Set source app in new state manager
   * 6) Remove renewalAppId and update searchValues with unlinkFromRenewal state call
   * 7) Update source app in db
   * 8) Verify renewalAppId was removed from source app doc. If not, throw error and rollback
   * 9) Close session
   */
  const session = await ApplicationModel.startSession();
  try {
    await session.withTransaction(async () => {
      logger.info(`Removing sourceAppId ${sourceAppId} from ${renewalApp.appId}.`);
      const updatedRenewalAppDoc = await ApplicationModel.findOneAndUpdate(
        { appId: renewalApp.appId },
        renewalApp,
        {
          session,
          new: true,
        },
      );

      if (!!updatedRenewalAppDoc?.sourceAppId) {
        throw new Error(`Failed to remove sourceAppId ${sourceAppId} from ${renewalApp.appId}!`);
      }

      logger.info(`Fetching source application ${sourceAppId}.`);
      const query: FilterQuery<ApplicationDocument> = {
        appId: sourceAppId,
      };
      const isReviewer = hasReviewScope(identity);
      if (!isReviewer) {
        query.submitterId = identity.userId;
      }
      const sourceApp = await ApplicationModel.findOne(query, null, { session });
      if (sourceApp) {
        const sourceAppObj: Application = sourceApp.toObject();
        const stateManager = new ApplicationStateManager(sourceAppObj);
        logger.info(
          `Removing renewalAppId ${sourceAppObj.renewalAppId} from ${sourceAppObj.appId}.`,
        );
        const updatedSourceApp = stateManager.unlinkFromRenewal();
        logger.info(`Renewal id removed, saving in db.`);
        const updatedSourceAppDoc = await ApplicationModel.findOneAndUpdate(
          { appId: updatedSourceApp.appId },
          updatedSourceApp,
          {
            session: session,
            new: true,
          },
        );

        if (!!updatedSourceAppDoc?.renewalAppId) {
          throw new Error(
            `Failed to remove renewalAppId ${sourceAppObj.renewalAppId} from ${sourceApp.appId}!`,
          );
        }

        logger.info(`Source app ${updatedSourceApp.appId} successfully updated.`);
      } else {
        throw new Error(`Could not fetch source application [${sourceAppId}].`);
      }
    });
  } catch (err) {
    logger.error('There was an error, rolling back!');
    logger.error(err);
  } finally {
    logger.info('Ending session');
    session.endSession();
  }
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
  if (
    appDocObj.isRenewal &&
    !renewalPeriodIsEnded(appDocObj) &&
    isInPreSubmittedState(appDocObj) &&
    appPart.state === 'CLOSED'
  ) {
    logger.info('Closing an unsubmitted renewal');
    const sourceAppId = appDocObj.sourceAppId;
    if (sourceAppId) {
      await unlinkRenewalFromSourceApp(updatedApp, sourceAppId, identity);
    } else {
      throw new Error(
        `Missing sourceAppId from application ${appDocObj.appId}, cannot close renewal.`,
      );
    }
  } else {
    await ApplicationModel.updateOne({ appId: updatedApp.appId }, updatedApp);
  }

  const stateChanged = appDocObj.state != updatedApp.state;
  if (stateChanged) {
    await onStateChange(updatedApp, appDocObj, emailClient, config);
  }
  // triggering this here to ensure attestedAtUtc value has been properly updated in the db before sending email
  // cannot rely on stateChanged result because attestation does not imply a state change has occurred
  // i.e. an approved app can be attested and stay in approved state
  const wasAttested = !isDate(appDocObj.attestedAtUtc) && isDate(updatedApp.attestedAtUtc);
  if (wasAttested) {
    await sendAttestationReceivedEmail(updatedApp, config, emailClient);
  }

  const deleted = await checkDeletedDocuments(appDocObj, updatedApp);
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

/**
 * Function to trigger email notifications based on the new application state, and in some cases a specific combination of a former state
 * with a new state
 * @param updatedApp
 * @param oldApplication
 * @param emailClient
 * @param config
 */
export async function onStateChange(
  updatedApp: Application,
  oldApplication: Application,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) {
  switch (updatedApp.state) {
    case 'REVIEW':
      // if application state changed to REVIEW (ie submitted) send an email to Admin
      await sendReviewEmail(oldApplication, updatedApp, config, emailClient);

      // send applicant email
      await sendSubmissionConfirmation(updatedApp, emailClient, config);
      break;

    case 'REVISIONS REQUESTED':
      await sendRevisionsRequestEmail(updatedApp, emailClient, config);
      break;

    case 'REJECTED':
      await sendRejectedEmail(updatedApp, emailClient, config);
      break;

    case 'APPROVED':
      // prevent usual approval emails going out when state changes from PAUSED to APPROVED, as this is not a new approval event
      if (oldApplication.state !== 'PAUSED') {
        await sendApplicationApprovedEmail(updatedApp, config, emailClient);
        await sendCollaboratorEmails(
          sendCollaboratorApprovedEmail,
          updatedApp,
          config,
          emailClient,
        );
      }
      break;

    case 'CLOSED':
      // only applications that have been previously approved get a CLOSED notification
      if (['APPROVED', 'PAUSED'].includes(oldApplication.state)) {
        await sendApplicationClosedEmail(updatedApp, config, emailClient);
        // only notify collaborators that their access has been removed if application transitioned from APPROVED -> CLOSED
        if (oldApplication.state === 'APPROVED') {
          await sendCollaboratorEmails(
            sendCollaboratorRemovedEmail,
            updatedApp,
            config,
            emailClient,
          );
        }
      }
      break;

    case 'PAUSED':
      await sendApplicationPausedEmail(updatedApp, config, emailClient);
      // only notify collaborators that their access has been removed if application transitioned from APPROVED -> PAUSED
      if (oldApplication.state === 'APPROVED') {
        await sendCollaboratorEmails(sendCollaboratorRemovedEmail, updatedApp, config, emailClient);
      }
      break;

    case 'EXPIRED':
      await sendAccessHasExpiredEmail(updatedApp, config, emailClient);
      // only notify collaborators that their access has been removed if application transitioned from APPROVED -> EXPIRED
      // disregards PAUSED -> EXPIRED transition, the collaborators would already have been notified of access removal
      if (oldApplication.state === 'APPROVED') {
        await sendCollaboratorEmails(sendCollaboratorRemovedEmail, updatedApp, config, emailClient);
      }
      break;

    case 'DRAFT':
      // this scenario occurs when an application transitions back to DRAFT from SIGN AND SUBMIT, due to a section becoming incomplete again
      // no emails are sent in this scenario, but need to account for this to prevent throwing error in default case, which breaks validation in the UI
      break;

    case 'SIGN AND SUBMIT':
      // when revisions are requested on the signature section only (incl. signature + general comments), the app transitions to SIGN AND SUBMIT
      // this is necessary to allow the applicant to upload a new signed pdf, which is only allowed in this state
      // the revisions email notification should still be sent to the applicant
      if (signatureOnlySectionRequiringRevisions(updatedApp)) {
        sendRevisionsRequestEmail(updatedApp, emailClient, config);
      }
      break;
    default:
      throw new Error(`Invalid app state: ${updatedApp.state}`);
  }
}

/**
 * ```
 * Delete orphan documents that are no longer associated with the application in the background, due to application updates:
 * 1) Changing selection of ethics letter from required to not required
 * 2) Admin requests revisions (signed app has to be uploaded again)
 * 3) Applicant changes a completed section when the application is in state sign & submit
 *
 * Compares document id arrays (ethics letters, signed app and approved pdf docs) from original application and updated application
 * Returns array of all objectIds that are not present in the updated application. This marks them for deletion from object storage
 * ```
 * @returns string[]
 */
async function checkDeletedDocuments(originalApp: Application, updatedApp: Application) {
  const removedIds: string[] = [];
  const ethicsArrayBefore = originalApp.sections.ethicsLetter.approvalLetterDocs
    .sort((a, b) => a.objectId.localeCompare(b.objectId))
    .map((e) => e.objectId);
  const ethicsArrayAfter = updatedApp.sections.ethicsLetter.approvalLetterDocs
    .sort((a, b) => a.objectId.localeCompare(b.objectId))
    .map((e) => e.objectId);
  const ethicsDiff = difference(ethicsArrayBefore, ethicsArrayAfter);
  // for the renewal/source app ethics letter scenario #1, with the same file id referenced in 2 (or more) different apps
  // we check that objectIds are unique, to ensure they are not deleted from object storage if associated with another application
  const uniqueEthicsIds: string[] = [];
  for await (const id of ethicsDiff) {
    const isReferenced = await isEthicsDocReferenced(id);
    if (!isReferenced) {
      uniqueEthicsIds.push(id);
    }
  }
  uniqueEthicsIds.forEach((o) => removedIds.push(o));

  if (
    originalApp.sections.signature.signedAppDocObjId &&
    originalApp.sections.signature.signedAppDocObjId !=
      updatedApp.sections.signature.signedAppDocObjId
  ) {
    removedIds.push(originalApp.sections.signature.signedAppDocObjId);
  }

  const approvedArrayBefore = originalApp.approvedAppDocs
    .sort((a, b) => a.approvedAppDocObjId.localeCompare(b.approvedAppDocObjId))
    .map((e) => e.approvedAppDocObjId);
  const approvedArrayAfter = updatedApp.approvedAppDocs
    .sort((a, b) => a.approvedAppDocObjId.localeCompare(b.approvedAppDocObjId))
    .map((e) => e.approvedAppDocObjId);
  const approvedDiff = difference(approvedArrayBefore, approvedArrayAfter);
  approvedDiff.forEach((o) => removedIds.push(o));

  logger.info(`removing docs: ${removedIds}`);
  return removedIds;
}

/**
 * ```
 * Creates a renewal application from an existing application
 * Uses mongoose withTransaction, so any error in execution will rollback all db changes and return an Error
 * Only non-reviewer users can create renewal applications
 * UserIdentity userId must match application submitterId
 * ```
 * @param appId  string
 * @param identity UserIdentity
 * @returns Promise<Application> | undefined
 */
export async function handleRenewalRequest(
  appId: string,
  identity: UserIdentity,
): Promise<Application | undefined> {
  /**
   * ```
   * Steps:
   * 1) Verifies UserIdentity is not a Reviewer
   * 2) Fetches source application by id.
   * 3) Verifies application is renewable
   * 4) Creates a db session
   * 5) Initializes renewalAppId variable
   * Inside transaction:
   * 6) Creates a renewal application object, which copies over all source app sections except dataAccessAgreements, appendices and signature
   * 7) Creates document in db with renewal app object
   * 8) Sets appId, searchValues on document
   * 9) Saves document in db
   * 10) Sets original app in state mgr, adds renewal appId
   * 11) Updates original app in db
   * 12) sets variable renewalAppId to be renewal application appId
   * 13) closes session
   * Outside transaction:
   * 14) Retrieves newly created renewal application by renewalAppId, and returns application object
   * ```
   */

  // admins cannot create renewals
  if (hasReviewScope(identity)) {
    throw new Error('Admins cannot create renewal applications.');
  }
  // fetch original app by id
  // findApplication queries submitterId by identity.userId, so if request is from an applicant, the userId must match application.submitterId
  const originalAppDoc = await findApplication(checkIsDefined(appId), identity);
  const originalAppDocObj: Application = originalAppDoc.toObject();

  if (!isRenewable(originalAppDocObj)) {
    throw new Error('Application is not renewable.');
  }

  logger.info('Starting session for renewal transaction.');
  const session = await ApplicationModel.startSession();
  let renewalAppId: string | undefined;
  try {
    await session.withTransaction(async () => {
      const renewalApp = renewalApplication(identity, originalAppDocObj);
      logger.info(`Creating renewal application from ${originalAppDocObj.appId}.`);
      const created = await ApplicationModel.create([renewalApp], { session: session });
      const renewalAppDoc = created[0];
      renewalAppDoc.appId = createAppId(renewalAppDoc);
      renewalAppDoc.searchValues = getSearchFieldValues(renewalAppDoc);
      logger.info(`Created renewal application ${renewalAppDoc.appId}, saving.`);
      await renewalAppDoc.save({ session: session });
      const stateManager = new ApplicationStateManager(originalAppDocObj);
      // add renewal info to original application
      const updated = stateManager.updateAsRenewed(renewalAppDoc.appId);
      // save updated original app in db
      logger.info(`Updating original application with renewalId [${updated.renewalAppId}].`);
      await ApplicationModel.updateOne({ appId: originalAppDocObj.appId }, updated, {
        session: session,
      });
      logger.info('Renewal successful!');
      renewalAppId = renewalAppDoc.appId;
    });
  } catch (err) {
    logger.error('There was an error, rolling back!');
    logger.error(err);
  } finally {
    logger.info('Ending session');
    session.endSession();
  }

  if (renewalAppId) {
    // refetch renewal app and return
    const renewal = await getById(renewalAppId, identity);
    return renewal;
  }
}
