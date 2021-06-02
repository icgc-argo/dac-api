import { Identity } from '@overture-stack/ego-token-middleware';
import { FilterQuery } from 'mongoose';
import { NotFound } from '../utils/errors';
import { getAppConfig } from '../config';
import { ApplicationDocument, ApplicationModel } from './model';
import 'moment-timezone';
import _ from 'lodash';
import { ApplicationStateManager, getSearchFieldValues, newApplication } from './state';
import { Application, ApplicationSummary, Collaborator, SearchResult, State } from './interface';
import { c } from '../utils/misc';

export async function createCollaborator(appId: string, collaborator: Collaborator, identity: Identity) {
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.addCollaborator(collaborator);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  return result.sections.collaborators.list[result.sections.collaborators.list.length - 1];
}

export async function updateCollaborator(appId: string, collaborator: Collaborator, identity: Identity) {
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.updateCollaborator(collaborator);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
}

export async function deleteCollaborator(appId: string, collaboratorId: string, identity: Identity) {
  const appDoc = await findApplication(appId, identity);
  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.deleteCollaborator(collaboratorId);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
}

export async function create(identity: Identity) {
  const app = newApplication(identity);
  const appDoc = await ApplicationModel.create(app);
  appDoc.appId = `DACO-${appDoc.appNumber}`;
  appDoc.searchValues = getSearchFieldValues(appDoc);
  await appDoc.save();
  const copy = appDoc.toObject();
  return copy;
}

export async function updatePartial(appPart: Partial<Application>, identity: Identity) {
  const isReviewer = await hasReviewScope(identity);
  const appDoc = await findApplication(c(appPart.appId), identity);

  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.updateApp(appPart, isReviewer);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
  const updated = await findApplication(c(result.appId), identity);
  return updated.toObject();
}

export async function updateFullDocument(app: Application, identity: Identity) {
  const isAdminOrReviewerResult = await hasReviewScope(identity);
  const query: FilterQuery<ApplicationDocument> = {
    appId: app.appId
  };

  if (!isAdminOrReviewerResult) {
    query.submitterId = identity.userId;
  }

  const appDoc = await ApplicationModel.findOne(query);
  if (!appDoc) {
    throw new NotFound('Application not found');
  }

  // this should be ET to match admin location when they do search
  app.lastUpdatedAtUtc = new Date();
  app.searchValues = getSearchFieldValues(app);
  await ApplicationModel.updateOne({ appId: app.appId }, app);
}

export async function search(params: {
  query: string,
  states: string[],
  page: number,
  pageSize: number,
  sortBy: { field: string, direction: string } [],
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
    sortObj[sb.field] = sb.direction == 'asc' ?  1 : -1 ;
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
        declaredAsRequired: app.sections.ethicsLetter.declaredAsRequired || null
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
  return copy;
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
