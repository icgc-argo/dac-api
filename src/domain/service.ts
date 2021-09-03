import { Identity } from '@overture-stack/ego-token-middleware';
import { FilterQuery } from 'mongoose';
import { NotFound } from '../utils/errors';
import { AppConfig, getAppConfig } from '../config';
import { ApplicationDocument, ApplicationModel } from './model';
import 'moment-timezone';
import _, { includes, isEmpty } from 'lodash';
import {
  ApplicationStateManager,
  getSearchFieldValues,
  newApplication,
  wasInRevisionRequestState,
} from './state';
import {
  Application,
  ApplicationSummary,
  Collaborator,
  SearchResult,
  State,
  UpdateApplication,
  UploadDocumentType,
} from './interface';
import { c } from '../utils/misc';
import { UploadedFile } from 'express-fileupload';
import { Storage } from '../storage';
import logger from '../logger';
import renderReviewEmail from '../emails/review-new';
import renderReviewRevisedEmail from '../emails/review-revised';
import renderEthicsLetterEmail from '../emails/ethics-letter';
import renderCollaboratorAdded from '../emails/collaborator-added';
import nodemail from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import renderSubmittedEmail from '../emails/submitted';
import renderRevisionsEmail from '../emails/revisions-requested';
import renderApprovedEmail from '../emails/application-approved';
import renderCollaboratorNotificationEmail from '../emails/collaborator-notification';
import renderCollaboratorRemovedEmail from '../emails/collaborator-removed';

export async function deleteDocument(
  appId: string,
  type: UploadDocumentType,
  objectId: string,
  identity: Identity,
  storageClient: Storage,
) {
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
  const viewAbleApplication = new ApplicationStateManager(
    updated.toObject(),
  ).prepareApplicantionForUser(false);
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

  if (updated.state == 'APPROVED') {
    if (type == 'ETHICS') {
      const config = await getAppConfig();
      sendEthicsLetterSubmitted(updated, config, emailClient);
    }
  }

  const viewAbleApplication = new ApplicationStateManager(
    updated.toObject(),
  ).prepareApplicantionForUser(false);
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
    // can download assets if app is CLOSED and but was APPROVED.
    !(appDocObj.state === 'CLOSED' && appDocObj.approvedAtUtc)
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

export async function createCollaborator(
  appId: string,
  collaborator: Collaborator,
  identity: Identity,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.addCollaborator(collaborator);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  if (result.state == 'APPROVED') {
    const config = await getAppConfig();
    sendCollaboratorAddedEmail(result, config, emailClient);
    // send notification email to new collaborator if application already approved
    sendCollaboratorApprovedEmail(result, collaborator, config, emailClient);
  }
  return result.sections.collaborators.list[result.sections.collaborators.list.length - 1];
}

export async function updateCollaborator(
  appId: string,
  collaborator: Collaborator,
  identity: Identity,
) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.updateCollaborator(collaborator);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
}

export async function deleteCollaborator(
  appId: string,
  collaboratorId: string,
  identity: Identity,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.deleteCollaborator(collaboratorId);
  await ApplicationModel.updateOne({ appId: result.appId }, result);

  if (result.state === 'APPROVED') {
    const collaborator = appDoc.sections.collaborators.list.find(
      (collab) => collab.id === collaboratorId,
    );

    if (collaborator) {
      logger.info('Collaborator was found, sending notification of access removal.');
      const config = await getAppConfig();
      sendCollaboratorRemovedEmail(result, collaborator, config, emailClient);
    }
  }
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

export async function updatePartial(
  appId: string,
  appPart: Partial<UpdateApplication>,
  identity: Identity,
  storageClient: Storage,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const isReviewer = await hasReviewScope(identity);
  const appDoc = await findApplication(c(appId), identity);
  const appDocObj = appDoc.toObject() as Application;

  // if current state is CLOSED, modifications are not allowed
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj);
  const updatedApp = stateManager.updateApp(appPart, isReviewer);
  await ApplicationModel.updateOne({ appId: updatedApp.appId }, updatedApp);
  const stateChanged = appDocObj.state != updatedApp.state;
  const config = await getAppConfig();
  if (stateChanged) {
    await onStateChange(updatedApp, appDocObj, emailClient, config);
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
  const updated = await findApplication(c(updatedApp.appId), identity);
  const updatedObj = updated.toObject();
  const viewAbleApplication = new ApplicationStateManager(updatedObj).prepareApplicantionForUser(
    isReviewer,
  );
  return viewAbleApplication;
}

async function onStateChange(
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

  if (updatedApp.state === 'APPROVED') {
    await sendApplicationApprovedEmail(updatedApp, config, emailClient);
    Promise.all(
      updatedApp.sections.collaborators.list.map((collab) => {
        sendCollaboratorApprovedEmail(updatedApp, collab, config, emailClient).catch((err) =>
          logger.error(`failed to send email to collaborator ${collab.id}: ${err}`),
        );
      }),
    ).catch((err) => logger.error(err));
  }
}

export async function search(
  params: {
    query: string;
    states: State[];
    page: number;
    pageSize: number;
    sortBy: { field: string; direction: string }[];
    includeCollaborators?: boolean;
    cursorSearch?: boolean;
  },
  identity: Identity,
): Promise<SearchResult> {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const query: FilterQuery<ApplicationDocument> = {};
  if (!isAdminOrReviewerResult) {
    query.submitterId = identity.userId;
  }

  if (params.states.length > 0) {
    query.state = {
      $in: params.states as State[],
    };
  }

  if (!!params.query) {
    query.$or = [];
    query.$or.push({ searchValues: new RegExp(params.query, 'gi') });
  }

  // default sort by appId
  const sortObj: any = {};
  params.sortBy.length > 0
    ? params.sortBy.forEach((sb) => {
        sortObj[mapField(sb.field)] = sb.direction == 'asc' ? 1 : -1;
      })
    : (sortObj['appId'] = 1);

  // separate query to get total docs
  const count = await ApplicationModel.find(query).countDocuments();
  if (count == 0) {
    return {
      pagingInfo: {
        totalCount: 0,
        pagesCount: 0,
        index: params.page,
      },
      items: [],
    };
  }

  let apps = [];
  if (params.cursorSearch) {
    for await (const app of await ApplicationModel.find(query).sort(sortObj)) {
      apps.push(app);
    }
  } else {
    apps = await ApplicationModel.find(query)
      .skip(params.page > 0 ? params.page * params.pageSize : 0)
      .limit(params.pageSize)
      .sort(sortObj)
      .exec();
  }

  const copy = apps.map(
    (app: ApplicationDocument) =>
      ({
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
          declaredAsRequired: app.sections.ethicsLetter.declaredAsRequired,
        },
        submittedAtUtc: app.submittedAtUtc,
        lastUpdatedAtUtc: app.lastUpdatedAtUtc,
        ...(params.includeCollaborators && {
          collaborators: app.sections.collaborators.list.map((collab: Collaborator) => collab.info),
        }),
      } as ApplicationSummary),
  );

  return {
    pagingInfo: {
      totalCount: count,
      pagesCount: Math.ceil((count * 1.0) / params.pageSize),
      index: params.page,
    },
    items: copy,
  };
}

export async function deleteApp(id: string, identity: Identity) {
  await ApplicationModel.deleteOne({
    appId: id,
  }).exec();
}

export async function getById(id: string, identity: Identity) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const query: FilterQuery<ApplicationDocument> = {
    appId: id,
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
  const viewAbleApplication = new ApplicationStateManager(copy).prepareApplicantionForUser(
    isAdminOrReviewerResult,
  );
  return viewAbleApplication;
}

async function findApplication(appId: string, identity: Identity) {
  const isReviewer = await hasReviewScope(identity);
  const query: FilterQuery<ApplicationDocument> = {
    appId,
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
  return scopes.some((v) => v == REVIEW_SCOPE);
}

function checkDeletedDocuments(appDocObj: Application, result: Application) {
  const removedIds: string[] = [];
  const ethicsArrayBefore = appDocObj.sections.ethicsLetter.approvalLetterDocs
    .sort((a, b) => a.objectId.localeCompare(b.objectId))
    .map((e) => e.objectId);
  const ethicsArrayAfter = result.sections.ethicsLetter.approvalLetterDocs
    .sort((a, b) => a.objectId.localeCompare(b.objectId))
    .map((e) => e.objectId);
  const diff = _.difference(ethicsArrayBefore, ethicsArrayAfter);
  diff.forEach((o) => removedIds.push(o));

  if (
    appDocObj.sections.signature.signedAppDocObjId &&
    appDocObj.sections.signature.signedAppDocObjId != result.sections.signature.signedAppDocObjId
  ) {
    removedIds.push(appDocObj.sections.signature.signedAppDocObjId);
  }

  return removedIds;
}

async function sendEmail(
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  fromEmail: string,
  fromName: string,
  to: Set<string>,
  subject: string,
  html: string,
  bcc?: Set<string>,
) {
  const info = await emailClient.sendMail({
    from: `"${fromName}" <${fromEmail}>`, // sender address
    to: Array.from(to).join(','), // list of receivers
    subject: subject, // Subject line
    html: html, // html body
    ...(bcc && { bcc: Array.from(bcc).join(',') }), // bcc address
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

async function sendSubmissionConfirmation(
  updatedApp: Application,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) {
  const submittedEmail = await renderSubmittedEmail(updatedApp, config.email.links);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    `[${updatedApp.appId}] We Received your Application`,
    submittedEmail.html,
  );
}

async function sendRevisionsRequestEmail(
  app: Application,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) {
  const submittedEmail = await renderRevisionsEmail(app, config);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(app),
    `[${app.appId}] Your Application has been Reopened for Revisions`,
    submittedEmail.html,
    new Set([config.email.dacoAddress]),
  );
}

async function sendApplicationApprovedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const email = await renderApprovedEmail(updatedApp, config.email.links);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    `[${updatedApp.appId}] Your Application has been Approved`,
    email.html,
    new Set([config.email.dacoAddress]),
  );
}
async function sendCollaboratorAddedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const collaborators = updatedApp.sections.collaborators.list;
  const reviewEmail = await renderCollaboratorAdded(
    updatedApp,
    {
      firstName: config.email.reviewerFirstName,
      lastName: config.email.reviewerLastName,
    },
    {
      info: collaborators[collaborators.length - 1].info,
      addedOn: new Date(),
    },
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
  );
  const emailContent = reviewEmail.html;
  const title = `A New Collaborator has been Added`;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([config.email.dacoAddress]),
    subject,
    emailContent,
  );
}

async function sendCollaboratorApprovedEmail(
  updatedApp: Application,
  collaborator: Collaborator,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const collaboratorApprovedEmail = await renderCollaboratorNotificationEmail(
    updatedApp,
    collaborator,
    config.email.links,
  );
  const emailContent = collaboratorApprovedEmail.html;
  const title = `You have been Granted Access`;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([collaborator.info.googleEmail, collaborator.info.institutionEmail]),
    subject,
    emailContent,
  );
}

async function sendCollaboratorRemovedEmail(
  updatedApp: Application,
  collaborator: Collaborator,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const collaboratorRemovedEmail = await renderCollaboratorRemovedEmail(
    updatedApp,
    collaborator,
    config.email.links,
  );
  const emailContent = collaboratorRemovedEmail.html;
  const title = `Your Access to ICGC Controlled Data has been Removed`;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([collaborator.info.googleEmail, collaborator.info.institutionEmail]),
    subject,
    emailContent,
  );
}

async function sendEthicsLetterSubmitted(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const ethicLetters = updatedApp.sections.ethicsLetter.approvalLetterDocs;
  const reviewEmail = await renderEthicsLetterEmail(
    updatedApp,
    {
      firstName: config.email.reviewerFirstName,
      lastName: config.email.reviewerLastName,
    },
    {
      addedOn: ethicLetters[ethicLetters.length - 1].uploadedAtUtc,
    },
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
  );
  const emailContent = reviewEmail.html;
  const title = `A New Ethics Letter has been Added`;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([config.email.dacoAddress]),
    subject,
    emailContent,
  );
}

async function sendReviewEmail(
  oldApplication: Application,
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  let emailContent: string;
  let title: string;
  if (wasInRevisionRequestState(oldApplication)) {
    // send new app for review email
    const reviewEmail = await renderReviewRevisedEmail(
      updatedApp,
      {
        firstName: config.email.reviewerFirstName,
        lastName: config.email.reviewerLastName,
      },
      {
        baseUrl: config.ui.baseUrl,
        pathTemplate: config.ui.sectionPath,
      },
    );
    emailContent = reviewEmail.html;
    title = `[${updatedApp.appId}] A Revised Application has been Submitted`;
  } else {
    // send new app for review email
    const reviewEmail = await renderReviewEmail(
      updatedApp,
      {
        firstName: config.email.reviewerFirstName,
        lastName: config.email.reviewerLastName,
      },
      {
        baseUrl: config.ui.baseUrl,
        pathTemplate: config.ui.sectionPath,
      },
    );
    emailContent = reviewEmail.html;
    title = `[${updatedApp.appId}] A New Application has been Submitted`;
  }

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([config.email.dacoAddress]),
    title,
    emailContent,
  );
}

function getApplicantEmails(app: Application) {
  return new Set([
    app.submitterEmail,
    app.sections.applicant.info.googleEmail,
    app.sections.applicant.info.institutionEmail,
  ]);
}

function throwApplicationClosedError(): () => void {
  throw new Error('Cannot modify an application in CLOSED state.');
}
