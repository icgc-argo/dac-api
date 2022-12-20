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

import { Identity, UserIdentity } from '@overture-stack/ego-token-middleware';
import { FilterQuery } from 'mongoose';
import { Request } from 'express';
import moment from 'moment';

import { NotFound } from '../../../utils/errors';
import { ApplicationDocument, ApplicationModel } from '../../model';
import { ApplicationStateManager, wasInRevisionRequestState } from '../../state';
import {
  ApplicationSummary,
  Collaborator,
  PersonalInfo,
  SearchResult,
  State,
  Sections,
  UserDataFromApprovedApplicationsResult,
} from '../../interface';

import { getAttestationByDate, isAttestable, isRenewable } from '../../../utils/calculations';
import { getLastPausedAtDate } from '../../../utils/misc';
import { hasReviewScope } from '../../../utils/permissions';

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

export async function search(params: SearchParams, identity: Identity): Promise<SearchResult> {
  const isAdminOrReviewerResult = hasReviewScope(identity);
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
        isAttestable: isAttestable(app),
        ...(params.includeCollaborators && {
          collaborators: app.sections.collaborators.list.map((collab: Collaborator) => collab.info),
        }),
        ableToRenew: isRenewable(app),
        revisionsRequested: wasInRevisionRequestState(app),
        currentApprovedAppDoc: !!app.approvedAppDocs.find((doc) => doc.isCurrent),
        ...(app.approvedAtUtc && {
          attestationByUtc: getAttestationByDate(app.approvedAtUtc),
        }),
        lastPausedAtUtc: getLastPausedAtDate(app),
        isRenewal: app.isRenewal,
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

export const searchCollaboratorApplications = async (
  identity: UserIdentity,
): Promise<Partial<ApplicationSummary>[]> => {
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
  const isAdminOrReviewerResult = hasReviewScope(identity);
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
  const viewAbleApplication = new ApplicationStateManager(copy).prepareApplicationForUser(
    isAdminOrReviewerResult,
  );
  return viewAbleApplication;
}

export async function findApplication(appId: string, identity: Identity) {
  const isReviewer = hasReviewScope(identity);
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

export const getSearchParams = (req: Request, defaultSort?: string): SearchParams => {
  const query = (req.query.query as string | undefined) || '';
  const states = req.query.states ? ((req.query.states as string).split(',') as State[]) : [];
  const page = Number(req.query.page) || 0;
  const pageSize = Number(req.query.pageSize) || 25;
  const sort = (req.query.sort as string | undefined) || defaultSort;
  const includeStats = Boolean(req.query.includeStats === 'true') || false;
  const sortBy = sort
    ? sort.split(',').map((s) => {
        const sortField = s.trim().split(':');
        return { field: sortField[0].trim(), direction: sortField[1].trim() };
      })
    : [];

  return {
    query,
    states,
    page,
    pageSize,
    sortBy,
    includeStats,
  };
};

export const getUsersFromApprovedApps = async (): Promise<
  UserDataFromApprovedApplicationsResult[]
> => {
  const query: FilterQuery<ApplicationDocument> = {
    state: 'APPROVED',
  };
  // retrieve applicant + collaborators, only they get daco access
  const results = await ApplicationModel.find(query, {
    appId: 1,
    'sections.applicant': 1,
    'sections.collaborators': 1,
    lastUpdatedAtUtc: 1,
  }).exec();

  return results.map((result) => {
    const approvedUsersInfo: UserDataFromApprovedApplicationsResult = {
      applicant: result.sections.applicant,
      collaborators: result.sections.collaborators,
      appId: result.appId,
      lastUpdatedAtUtc: result.lastUpdatedAtUtc,
    };
    return approvedUsersInfo;
  });
};
