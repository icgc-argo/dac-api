import { Identity } from '@overture-stack/ego-token-middleware';
import { FilterQuery } from 'mongoose';
import { NotFound } from '../utils/errors';
import { AppConfig, getAppConfig } from '../config';
import { ApplicationDocument, ApplicationModel } from './model';
import 'moment-timezone';
import _ from 'lodash';
import { ApplicationStateManager, getSearchFieldValues, newApplication } from './state';
import { Application, ApplicationSummary, Collaborator, SearchResult, State, UploadDocumentType } from './interface';
import { c } from '../utils/misc';
import { UploadedFile } from 'express-fileupload';
import { Storage } from '../storage';
import logger from '../logger';
import renderReviewEmail from '../emails/review';
import nodemail from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import renderSubmittedEmail from '../emails/submitted';

export async function deleteDocument(appId: string,
                                    type: UploadDocumentType,
                                    objectId: string,
                                    identity: Identity,
                                    storageClient: Storage) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.deleteDocument(objectId, type);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  await storageClient.delete(objectId);
  const updated = await findApplication(c(result.appId), identity);
  const viewAbleApplication = new ApplicationStateManager(updated.toObject()).prepareApplicantionForUser(false);
  return viewAbleApplication;
}

export async function uploadDocument(appId: string,
                                    type: UploadDocumentType,
                                    file: UploadedFile,
                                    identity: Identity,
                                    storageClient: Storage) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  let existingId: string | undefined = undefined;
  if (type == 'SIGNED_APP') {
    existingId = appDocObj.sections.signature.signedAppDocObjId;
  }
  const id = await storageClient.upload(file, existingId);
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.addDocument(id, file.name, type);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  const updated = await findApplication(c(result.appId), identity);
  const viewAbleApplication = new ApplicationStateManager(updated.toObject()).prepareApplicantionForUser(false);
  return viewAbleApplication;
}

export async function getApplicationAssetsAsStream(appId: string,
                                                identity: Identity,
                                                storageClient: Storage)  {

  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;

  if (appDocObj.state !== 'REVIEW' && appDocObj.state !== 'APPROVED') {
    throw new Error('Cannot download package in this state');
  }

  const docs = appDocObj.sections.ethicsLetter.approvalLetterDocs.map(e => ({
    id: e.objectId,
    name: e.name
  }));

  docs.push({
    name: appDocObj.sections.signature.signedDocName,
    id: appDocObj.sections.signature.signedAppDocObjId,
  });

  // get the assets as streams from the response bodies
  const downloaded = docs.map(async (d) => {
    const stream = await storageClient.downloadAsStream(d.id);
    return {
      ...d,
      stream
    };
  });
  const assets = await Promise.all(downloaded);
  return assets;
}

export async function createCollaborator(appId: string, collaborator: Collaborator, identity: Identity) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.addCollaborator(collaborator);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  return result.sections.collaborators.list[result.sections.collaborators.list.length - 1];
}

export async function updateCollaborator(appId: string, collaborator: Collaborator, identity: Identity) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.updateCollaborator(collaborator);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
}

export async function deleteCollaborator(appId: string, collaboratorId: string, identity: Identity) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.deleteCollaborator(collaboratorId);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
}

export async function create(identity: Identity) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const app = newApplication(identity);
  const appDoc = await ApplicationModel.create(app);
  appDoc.appId = `DACO-${appDoc.appNumber}`;
  appDoc.searchValues = getSearchFieldValues(appDoc);
  await appDoc.save();
  const copy = appDoc.toObject();
  return copy;
}

export async function updatePartial(appPart: Partial<Application>,
                                    identity: Identity,
                                    storageClient: Storage,
                                    emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>) {

  const isReviewer = await hasReviewScope(identity);
  const appDoc = await findApplication(c(appPart.appId), identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const updatedApp = stateManager.updateApp(appPart, isReviewer);
  await ApplicationModel.updateOne({ appId: updatedApp.appId }, updatedApp);
  const stateChanged = appDocObj.state != updatedApp.state;
  const config = await getAppConfig();
  if (stateChanged) {
    await onStateChange(updatedApp, emailClient, config);
  }
  const deleted = checkDeletedDocuments(appDocObj, updatedApp);
  // Delete orphan documents that are no longer associated with the application in the background
  // this can be a result of applicantion getting updated :
  // - Changing selection of ethics letter from required to not required
  // - Admin requests revisions (signed app has to be uploaded again)
  // - Applicant changes a completed section when the application is in state sign & submit
  deleted.map(d => storageClient.delete(d)
    .catch(e => logger.error(`failed to delete document ${d}`, e))
  );
  const updated = await findApplication(c(updatedApp.appId), identity);
  const updatedObj =  updated.toObject();
  const viewAbleApplication = new ApplicationStateManager(updatedObj).prepareApplicantionForUser(isReviewer);
  return viewAbleApplication;
}

async function onStateChange(updatedApp: Application,
                            emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
                            config: AppConfig) {

  // if application state changed to REVIEW (ie submitted) send an email to Admin
  if (updatedApp.state == 'REVIEW') {
    // send review email
    const html = renderReviewEmail(updatedApp);
    await sendEmail(emailClient,
      config.email.fromAddress,
      config.email.fromName,
      new Set([config.email.dacoAddress]),
      `[${updatedApp.appId}] Application Submitted`,
      html);

    // send applicant email
    const submittedEmailHtml = renderSubmittedEmail(updatedApp);
    await sendEmail(emailClient,
      config.email.fromAddress,
      config.email.fromName,
      new Set([
        updatedApp.submitterEmail,
        updatedApp.sections.applicant.info.googleEmail,
        updatedApp.sections.applicant.info.institutionEmail
      ]),
      `[${updatedApp.appId}] We Received your Application`,
      submittedEmailHtml);
  }
}

export async function search(params: {
                              query: string,
                              states: string[],
                              page: number,
                              pageSize: number,
                              sortBy: { field: string, direction: string }[],
                            }, identity: Identity): Promise<SearchResult> {

  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const query: FilterQuery<ApplicationDocument> = {};
  if (!isAdminOrReviewerResult) {
    query.submitterId = identity.userId;
  }

  if (params.states.length > 0) {
    query.state = {
      $in: params.states as State[]
    };
  }

  if (!!params.query) {
    query.$or = [];
    query.$or.push({searchValues: new RegExp(params.query, 'gi')});
  }

  const sortObj: any = {};
  params.sortBy.forEach(sb => {
    sortObj[mapField(sb.field)] = sb.direction == 'asc' ?  1 : -1 ;
  });

  const count = await ApplicationModel.find(query).countDocuments();
  if (count == 0) {
    return {
      pagingInfo: {
        totalCount: 0,
        pagesCount: 0,
        index: params.page,
      },
      items: []
    };
  }

  const apps = await ApplicationModel.find(query)
    .skip( params.page > 0 ? ( ( params.page ) * params.pageSize ) : 0)
    .limit( params.pageSize )
    .sort( sortObj )
    .exec();

  const copy = apps.map((app: ApplicationDocument) => ({
      appId: `${app.appId}`,
      applicant: { info: app.sections.applicant.info },
      submitterId: app.submitterId,
      approvedAtUtc: app.approvedAtUtc,
      closedAtUtc: app.closedAtUtc,
      closedBy: app.closedBy,
      expiresAtUtc: app.expiresAtUtc,
      state: app.state,
      ethics: {
        // tslint:disable-next-line:no-null-keyword
        declaredAsRequired: app.sections.ethicsLetter.declaredAsRequired
      },
      submittedAtUtc: app.submittedAtUtc,
      lastUpdatedAtUtc: app.lastUpdatedAtUtc
    } as ApplicationSummary)
  );

  return {
    pagingInfo: {
      totalCount: count,
      pagesCount: Math.ceil(count * 1.0 / params.pageSize),
      index: params.page,
    },
    items: copy
  };
}

export async function deleteApp(id: string, identity: Identity) {
  await ApplicationModel.deleteOne({
    appId: id
  }).exec();
}

export async function getById(id: string, identity: Identity) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const query: FilterQuery<ApplicationDocument> = {
    appId: id
  };
  if (!isAdminOrReviewerResult) {
    query.submitterId = identity.userId;
  }
  const apps = await ApplicationModel.find(query).exec();
  if (apps.length == 0) {
    return undefined;
  }
  const app = apps[0];
  const copy = app.toObject();
  const viewAbleApplication = new ApplicationStateManager(copy).prepareApplicantionForUser(isAdminOrReviewerResult);
  return viewAbleApplication;
}


async function findApplication(appId: string, identity: Identity) {
  const isReviewer = await hasReviewScope(identity);
  const query: FilterQuery<ApplicationDocument> = {
    appId
  };

  if (!isReviewer) {
    query.submitterId = identity.userId;
  }

  const appDoc = await ApplicationModel.findOne(query).exec();
  if (!appDoc) {
    throw new NotFound('Application not found');
  }
  return appDoc;
}

async function hasReviewScope(identity: Identity) {
  const REVIEW_SCOPE = (await getAppConfig()).auth.REVIEW_SCOPE;
  const scopes = identity.tokenInfo.context.scope;
  return scopes.some(v => v == REVIEW_SCOPE);
}

function checkDeletedDocuments(appDocObj: Application, result: Application) {
  const removedIds: string[] = [];
  const ethicsArrayBefore =
    appDocObj.sections.ethicsLetter.approvalLetterDocs.sort((a, b) => a.objectId.localeCompare(b.objectId)).map(e => e.objectId);
  const ethicsArrayAfter =
    result.sections.ethicsLetter.approvalLetterDocs.sort((a, b) => a.objectId.localeCompare(b.objectId)).map(e => e.objectId);
  const diff = _.difference(ethicsArrayBefore, ethicsArrayAfter);
  diff.forEach(o => removedIds.push(o));

  if (appDocObj.sections.signature.signedAppDocObjId

      && appDocObj.sections.signature.signedAppDocObjId != result.sections.signature.signedAppDocObjId) {
    removedIds.push(appDocObj.sections.signature.signedAppDocObjId);
  }

  return removedIds;
}

async function sendEmail(emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  fromEmail: string,
  fromName: string,
  to: Set<string>,
  subject: string,
  html: string) {

  const info = await emailClient.sendMail({
    from: `"${fromName}" <${fromEmail}>`, // sender address
    to: Array.from(to).join(','), // list of receivers
    subject: subject, // Subject line
    html: html, // html body
  });
}

function mapField(field: string) {
  //  state, primaryAffiliation, displayName, googleEmail, ethicsRequired, lastUpdatedAtUtc, appId, expiresAtUtc
  switch (field) {
    case 'primaryAffiliation':
    case 'googleEmail':
    case 'displayName':
      return `sections.applicant.info.${field}`;
    case 'ethicsRequired':
      return `sections.ethicsLetter.declaredAsRequired`;
    default:
      return field;
  }

}