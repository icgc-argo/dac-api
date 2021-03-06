import { Identity } from '@overture-stack/ego-token-middleware';
import { FilterQuery } from 'mongoose';
import { NotFound } from '../utils/errors';
import { AppConfig, getAppConfig } from '../config';
import { ApplicationDocument, ApplicationModel } from './model';
import 'moment-timezone';
import moment, { unitOfTime } from 'moment';
import { chunk, difference, isEmpty } from 'lodash';
import { Attachment } from 'nodemailer/lib/mailer';
import { UploadedFile } from 'express-fileupload';
import nodemail from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import {
  ApplicationStateManager,
  getSearchFieldValues,
  newApplication,
  wasInRevisionRequestState,
} from './state';
import {
  Application,
  ApplicationSummary,
  ApplicationUpdate,
  Collaborator,
  ColumnHeader,
  SearchResult,
  State,
  UpdateApplication,
  UploadDocumentType,
} from './interface';
import { Storage } from '../storage';
import logger from '../logger';
import renderReviewEmail from '../emails/review-new';
import renderReviewRevisedEmail from '../emails/review-revised';
import renderEthicsLetterEmail from '../emails/ethics-letter';
import renderCollaboratorAdded from '../emails/collaborator-added';

import renderSubmittedEmail from '../emails/submitted';
import renderRevisionsEmail from '../emails/revisions-requested';
import renderApprovedEmail from '../emails/application-approved';
import renderCollaboratorNotificationEmail from '../emails/collaborator-notification';
import renderCollaboratorRemovedEmail from '../emails/collaborator-removed';
import renderApplicationClosedEmail from '../emails/closed-approved';
import renderRejectedEmail from '../emails/rejected';
import renderAccessExpiringEmail from '../emails/access-expiring';
import renderAccessHasExpiredEmail from '../emails/access-has-expired';
import renderAttestationRequiredEmail from '../emails/attestation-required';
import renderApplicationPausedEmail from '../emails/application-paused';

import { Report } from '../routes/applications';
import { c, getDacoRole, getUpdateAuthor } from '../utils/misc';
import { getAttestationByDate, isAttestable, sortByDate } from '../utils/calculations';

type RejectedUpdate = { status: 'rejected'; reason: string };
type FulfilledUpdate = { status: 'fulfilled'; value: Application };

export async function deleteDocument(
  appId: string,
  type: UploadDocumentType,
  objectId: string,
  identity: Identity,
  storageClient: Storage,
) {
  const config = await getAppConfig();
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj, config);
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
    config,
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
  const config = await getAppConfig();
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
  const stateManager = new ApplicationStateManager(appDocObj, config);
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
    config,
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

export async function createCollaborator(
  appId: string,
  collaborator: Collaborator,
  identity: Identity,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const config = await getAppConfig();
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj, config);
  const result = stateManager.addCollaborator(
    collaborator,
    identity.userId,
    isAdminOrReviewerResult,
  );
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  if (result.state == 'APPROVED') {
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
  const config = await getAppConfig();
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  if (isAdminOrReviewerResult) {
    throw new Error('not allowed');
  }
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj, config);
  const result = stateManager.updateCollaborator(
    collaborator,
    getUpdateAuthor(identity.userId, isAdminOrReviewerResult),
  );
  await ApplicationModel.updateOne({ appId: result.appId }, result);
}

export async function deleteCollaborator(
  appId: string,
  collaboratorId: string,
  identity: Identity,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const config = await getAppConfig();
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj, config);
  const result = stateManager.deleteCollaborator(
    collaboratorId,
    identity.userId,
    isAdminOrReviewerResult,
  );
  await ApplicationModel.updateOne({ appId: result.appId }, result);

  if (result.state === 'APPROVED') {
    const collaborator = appDoc.sections.collaborators.list.find(
      (collab) => collab.id === collaboratorId,
    );

    if (collaborator) {
      logger.info('Collaborator was found, sending notification of access removal.');
      sendCollaboratorRemovedEmail(result, collaborator, config, emailClient);
    }
  }
}

export async function create(identity: Identity) {
  const config = await getAppConfig();
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
  const viewableApp = new ApplicationStateManager(copy, config).prepareApplicationForUser(
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
  const config = await getAppConfig();
  const isReviewer = await hasReviewScope(identity);
  const appDoc = await findApplication(c(appId), identity);
  const appDocObj = appDoc.toObject() as Application;

  // if current state is CLOSED, modifications are not allowed
  if (appDocObj.state === 'CLOSED') {
    throwApplicationClosedError();
  }
  const stateManager = new ApplicationStateManager(appDocObj, config);
  const updatedApp = stateManager.updateApp(
    appPart,
    isReviewer,
    getUpdateAuthor(identity.userId, isReviewer),
  );
  await ApplicationModel.updateOne({ appId: updatedApp.appId }, updatedApp);
  const stateChanged = appDocObj.state != updatedApp.state;
  if (stateChanged) {
    await onStateChange(updatedApp, appDocObj, emailClient, config);
  }
  // triggering this here to ensure attestedAtUtc value has been properly updated in the db before sending email
  // cannot rely on stateChanged result because attestation does not imply a state change has occurred
  // i.e. an approved app can be attested and stay in approved state
  const wasAttested = isEmpty(appDocObj.attestedAtUtc) && !isEmpty(updatedApp.attestedAtUtc);
  if (wasAttested) {
    // TODO: await send attestation received email
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
  const viewAbleApplication = new ApplicationStateManager(
    updatedObj,
    config,
  ).prepareApplicationForUser(isReviewer);
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
    // TODO: send PAUSED email
  }
}

export type SearchParams = {
  query: string;
  states: State[];
  page: number;
  pageSize: number;
  sortBy: { field: string; direction: string }[];
  includeCollaborators?: boolean;
  cursorSearch?: boolean;
  includeStats?: boolean;
};

export async function search(params: SearchParams, identity: Identity): Promise<SearchResult> {
  const config = await getAppConfig();
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const query: FilterQuery<ApplicationDocument> = {};
  if (!isAdminOrReviewerResult) {
    query.submitterId = identity.userId;
  }

  if (params.states.length > 0) {
    if (isAdminOrReviewerResult && params.states.includes('CLOSED')) {
      query.$or = [];
      query.$or.push({
        state: {
          $in: params.states.filter((s) => s !== 'CLOSED'),
        },
      });
      query.$or.push({
        state: 'CLOSED',
        approvedAtUtc: {
          $exists: true,
        },
      });
    } else {
      query.state = {
        $in: params.states as State[],
      };
    }
  }

  if (!!params.query) {
    query.searchValues = new RegExp(params.query, 'gi');
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
  const countByState: { [k in State]: number } = {
    APPROVED: 0,
    CLOSED: 0,
    DRAFT: 0,
    EXPIRED: 0,
    REJECTED: 0,
    REVIEW: 0,
    'REVISIONS REQUESTED': 0,
    'SIGN AND SUBMIT': 0,
    PAUSED: 0,
  };
  if (count == 0) {
    return {
      pagingInfo: {
        totalCount: 0,
        pagesCount: 0,
        index: params.page,
      },
      items: [],
      stats: {
        countByState,
      },
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
      .collation({ locale: 'en' })
      .sort(sortObj)
      .exec();
  }

  if (params.includeStats) {
    // const statsQuery = _.cloneDeep(query);
    const aggByStateResult = await ApplicationModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$state',
          count: { $sum: 1 },
        },
      },
    ]);
    aggByStateResult.forEach((d) => {
      countByState[d._id as State] = d.count;
    });
  }
  const copy = apps.map(
    (app: ApplicationDocument) =>
      ({
        appId: `${app.appId}`,
        applicant: { info: app.sections.applicant.info, address: app.sections.applicant.address },
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
        attestedAtUtc: app.attestedAtUtc,
        isAttestable: isAttestable(app, config),
        ...(params.includeCollaborators && {
          collaborators: app.sections.collaborators.list.map((collab: Collaborator) => collab.info),
        }),
        revisionsRequested: wasInRevisionRequestState(app),
        currentApprovedAppDoc: !!app.approvedAppDocs.find((doc) => doc.isCurrent),
        ...(app.approvedAtUtc && {
          attestationByUtc: getAttestationByDate(app.approvedAtUtc, config),
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
    stats: params.includeStats
      ? {
          countByState: countByState,
        }
      : undefined,
  };
}

export const searchCollaboratorApplications = async (identity: Identity) => {
  // find all applications on which the logged-in user has collaborator access
  // using ego token email matched against collaborator googleEmail
  const apps = await ApplicationModel.find({
    state: 'APPROVED',
    'sections.collaborators.list.info.googleEmail': identity.tokenInfo.context.user.email,
  });

  return apps.map(
    (app: ApplicationDocument) =>
      ({
        appId: `${app.appId}`,
        applicant: { info: app.sections.applicant.info },
        expiresAtUtc: app.expiresAtUtc,
      } as Partial<ApplicationSummary>),
  );
};

const searchPauseableApplications = async (query: FilterQuery<ApplicationDocument>) => {
  // can still run this multiple times in the same 24hr period,
  // as any apps that were paused previously will be ignored because we're looking for APPROVED state
  const apps = await ApplicationModel.find(query).exec();
  return apps;
};

const addToReport = (type: keyof Report, report: Report, appId: string) => {
  report[type].count++;
  report[type].ids.push(appId);
  return report;
};

const pauseApplication = async (currentApp: Application, identity: Identity, reason?: string) => {
  const config = await getAppConfig();
  // set app in state
  const appObj = new ApplicationStateManager(currentApp, config);
  // update app state, including transition to paused + update event
  const role = await getDacoRole(identity);
  logger.info(`Role ${role} is trying to PAUSE appId ${currentApp.appId}`);
  const result = appObj.updateApp({ state: 'PAUSED', pauseReason: reason }, false, {
    id: identity.userId,
    role,
  });
  // save new app state in db
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  // retrieve updated app from db
  const updatedApp = await ApplicationModel.findOne({
    appId: result.appId,
  }).exec();
  return updatedApp?.toObject() as Application;
};

const getPauseableQuery = (config: AppConfig, currentDate: Date) => {
  const {
    durations: {
      attestation: { count, unitOfTime },
    },
  } = config;
  // find all apps that are APPROVED with an approval date matching the configured time period
  // default is 1 year to match DACO but we will need this for testing
  const approvalDate = moment(currentDate).subtract(
    count,
    unitOfTime as unitOfTime.DurationConstructor,
  );
  const approvalDayStart = moment(approvalDate).startOf('day').toDate();
  const query: FilterQuery<ApplicationDocument> = {
    state: 'APPROVED',
    approvedAtUtc: {
      // filter for any time period equal to or past attestationByUtc in case an application that should have been paused previously
      // is caught on a subsequent job run, as it will still be APPROVED and not have an attestedAtUtc value
      $gte: approvalDayStart,
    },
    // tslint:disable-next-line:no-null-keyword
    $or: [{ attestedAtUtc: { $exists: false } }, { attestedAtUtc: { $eq: null } }], // check the applicant has not already attested, value may be null after renewal
  };

  return query;
};

export const runPauseAppCheck = async (
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  report: Report,
  user: Identity,
  currentDate: Date,
) => {
  const config = await getAppConfig();
  const query = getPauseableQuery(config, currentDate);
  const pauseableAppCount = await ApplicationModel.find(query).countDocuments();
  // if no applications fit the criteria, return initial report
  if (pauseableAppCount === 0) {
    logger.info('No applications need to be paused at this time.');
    return report.pausedApps;
  }
  logger.info(`There are ${pauseableAppCount} apps that should be PAUSED.`);
  const pauseableApps = await searchPauseableApplications(query);
  const requestChunkSize = 5;

  const results: (RejectedUpdate | FulfilledUpdate)[][] = [];

  const requests = chunk(pauseableApps, requestChunkSize).map(
    async (appChunk: ApplicationDocument[]) => {
      return Promise.allSettled(
        appChunk.map(async (app: ApplicationDocument) => {
          const updatedAppObj = (await pauseApplication(
            app,
            user,
            'PENDING ATTESTATION',
          )) as Application;
          if (updatedAppObj.state !== 'PAUSED') {
            throw new Error(`PAUSED update failed on ${updatedAppObj.appId}`);
          }
          onStateChange(updatedAppObj, app, emailClient, config);
          return updatedAppObj;
        }),
      );
    },
  );

  for (const chunk of requests) {
    const result = (await chunk) as (FulfilledUpdate | RejectedUpdate)[];
    results.push(result);
  }

  const allResults = results.flat();
  // add successful pause requests to report, send emails for each
  allResults
    .filter((result) => result.status === 'fulfilled')
    .map((fulfilled) => {
      const { value } = fulfilled as FulfilledUpdate;
      logger.info(`Successfully PAUSED ${value.appId}`);
      // TODO: send email
      addToReport('pausedApps', report, value.appId);
    });

  // add failed pause requests to report errors
  allResults
    .filter((result) => result.status === 'rejected')
    .map((rejected) => {
      const { reason } = rejected as RejectedUpdate;
      logger.warn(`Error pausing application: ${reason}`);
      report.pausedApps.errors.push(`Error pausing application: ${reason}`);
    });

  logger.info('returning PAUSED app report');
  return report.pausedApps;
};

export const getApplicationUpdates = async () => {
  // do not return empty arrays. this is for apps existing before reset_updates_list migration
  // this state should not be possible for applications created after this migration
  const apps = await ApplicationModel.find(
    { updates: { $ne: [] } },
    { appId: 1, updates: 1 },
  ).exec();

  return apps;
};

export async function deleteApp(id: string, identity: Identity) {
  await ApplicationModel.deleteOne({
    appId: id,
  }).exec();
}

export async function getById(id: string, identity: Identity) {
  const config = await getAppConfig();
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
  const viewAbleApplication = new ApplicationStateManager(copy, config).prepareApplicationForUser(
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

export async function hasReviewScope(identity: Identity) {
  const REVIEW_SCOPE = (await getAppConfig()).auth.reviewScope;
  const scopes = identity.tokenInfo.context.scope;
  return scopes.some((v) => v == REVIEW_SCOPE);
}

export async function hasDacoSystemScope(identity: Identity) {
  const DACO_SYSTEM_SCOPE = await (await getAppConfig()).auth.dacoSystemScope;
  const scopes = identity.tokenInfo.context.scope;
  return scopes.some((scope) => scope === DACO_SYSTEM_SCOPE);
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

  console.log('removing docs: ', removedIds);
  return removedIds;
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

export async function sendEmail(
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  fromEmail: string,
  fromName: string,
  to: Set<string>,
  subject: string,
  html: string,
  bcc?: Set<string>,
  attachments?: Attachment[],
) {
  const info = await emailClient.sendMail({
    from: `"${fromName}" <${fromEmail}>`, // sender address
    to: Array.from(to).join(','), // list of receivers
    subject: subject, // Subject line
    html: html, // html body
    ...(bcc && { bcc: Array.from(bcc).join(',') }), // bcc address
    ...(attachments && { attachments }),
  });
}

function mapField(field: string) {
  //  state, primaryAffiliation, displayName, googleEmail, ethicsRequired, lastUpdatedAtUtc, appId, expiresAtUtc, country
  switch (field) {
    case 'primaryAffiliation':
    case 'googleEmail':
    case 'displayName':
      return `sections.applicant.info.${field}`;
    case 'ethicsRequired':
      return `sections.ethicsLetter.declaredAsRequired`;
    case 'country':
      return `sections.applicant.address.country`;
    case 'currentApprovedAppDoc':
      return 'approvedAppDocs.isCurrent';
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

async function sendRejectedEmail(
  updatedApp: Application,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) {
  const submittedEmail = await renderRejectedEmail(updatedApp, config.email.links);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    `[${updatedApp.appId}] Your Application has been Rejected`,
    submittedEmail.html,
    new Set([config.email.dacoAddress]),
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

async function sendAttestationRequiredEmail(
  currentApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const title = 'An Annual Attestation is Required';
  const email = await renderAttestationRequiredEmail(
    currentApp,
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
    config,
  );
  const emailContent = email.html;
  const subject = `[${currentApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(currentApp),
    subject,
    emailContent,
  );
}

async function sendApplicationPausedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const title = 'Your Access to ICGC Controlled Data has been Paused';
  const email = await renderApplicationPausedEmail(
    updatedApp,
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
    config,
  );
  const emailContent = email.html;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    subject,
    emailContent,
  );
}

async function sendAccessExpiringEmail(
  updatedApp: Application,
  config: AppConfig,
  daysToExpiry: number, // this will come from the cronjob that is executing, i.e. first (90 days) or second (45 days) warning
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const title = `Your Access is Expiring in ${daysToExpiry} days`;
  const notificationEmail = await renderAccessExpiringEmail(
    updatedApp,
    config.email.links,
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
    config.durations,
    daysToExpiry,
  );
  const emailContent = notificationEmail.html;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    subject,
    emailContent,
  );
}

async function sendAccessHasExpiredEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const title = `Your Access to ICGC Controlled Data has Expired`;
  const notificationEmail = await renderAccessHasExpiredEmail(
    updatedApp,
    config.email.links,
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
    config.durations,
  );
  const emailContent = notificationEmail.html;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    subject,
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

async function sendApplicationClosedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const email = await renderApplicationClosedEmail(updatedApp, config.email.links);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    `[${updatedApp.appId}] Your Access to ICGC Controlled Data has been Removed`,
    email.html,
    new Set([config.email.dacoAddress]),
  );
}
