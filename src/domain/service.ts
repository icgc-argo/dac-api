import { Identity } from '@overture-stack/ego-token-middleware';
import { FilterQuery } from 'mongoose';
import { NotFound } from '../utils/errors';
import { getAppConfig } from '../config';
import { Application, ApplicationSummary, SearchResult, State, Address, SectionError, PersonalInfo } from './interface';
import { ApplicationDocument, ApplicationModel } from './model';
import 'moment-timezone';
import _ from 'lodash';
import { ApplicationStateManager, getSearchFieldValues } from './state';

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
  const query: FilterQuery<ApplicationDocument> = {
    appId: appPart.appId
  };

  if (!isReviewer) {
    query.submitterId = identity.userId;
  }

  const appDoc = await ApplicationModel.findOne(query).exec();
  if (!appDoc) {
    throw new NotFound('Application not found');
  }

  const appDocObj = appDoc.toObject() as Application;
  const stateManager = new ApplicationStateManager(appDocObj);
  const result = stateManager.updateApp(appPart);
  await ApplicationModel.updateOne({ appId: result.appId }, result);
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

function newApplication(identity: Identity): Partial<Application> {
  const app: Partial<Application> = {
    state: 'DRAFT',
    submitterId: identity.userId,
    submitterEmail: identity.tokenInfo.context.user.email,
    revisionRequest: {
      applicant: {
        details:  '',
        requested:  false,
      },
      collaborators: {
        details:  '',
        requested:  false,
      },
      general: {
        details:  '',
        requested:  false,
      },
      projectInfo: {
        details:  '',
        requested:  false,
      },
      representative: {
        details:  '',
        requested:  false,
      },
      signature: {
        details:  '',
        requested:  false
      }
    },
    sections: {
      collaborators: {
        meta: {status: 'PRISTINE', errorsList: []},
        list: [],
      },
      ITAgreements: {
        meta: {status: 'PRISTINE', errorsList: []},
        agreements: getITAgreements()
      },
      appendices: {
        meta: {status: 'PRISTINE', errorsList: []},
        agreements: getAppendixAgreements()
      },
      dataAccessAgreement: {
        meta: {status: 'PRISTINE', errorsList: []},
        agreements: getDataAccessAgreement()
      },
      terms: {
        meta: {status: 'PRISTINE', errorsList: []},
        agreement: {
          accepted: false,
          name: 'introduction_agree_to_terms'
        }
      },

      applicant: {
        meta: {status: 'PRISTINE', errorsList: []},
        address: {
          building: '',
          cityAndProvince: '',
          country: '',
          postalCode: '',
          streetAddress: ''
        },
        info: {
          firstName: '',
          googleEmail: '',
          displayName: '',
          institutionEmail: '',
          institutionWebsite: '',
          lastName: '',
          middleName: '',
          positionTitle: '',
          primaryAffiliation: '',
          suffix: '',
          title: '',
        }
      },
      projectInfo: {
        background: '',
        methodology: '',
        aims: '',
        website: '',
        title: '',
        publicationsURLs: [],
        meta: { status: 'PRISTINE', errorsList: [] }
      },
      ethicsLetter: {
        // tslint:disable-next-line:no-null-keyword
        declaredAsRequired: null,
        approvalLetterDocs: [ ],
        meta: { status: 'PRISTINE', errorsList: [] }
      },
      representative: {
        address: {
          building: '',
          cityAndProvince: '',
          country: '',
          postalCode: '',
          streetAddress: ''
        },
        addressSameAsApplicant: false,
        info: {
          firstName: '',
          googleEmail: '',
          institutionEmail: '',
          displayName: '',
          institutionWebsite: '',
          lastName: '',
          middleName: '',
          positionTitle: '',
          primaryAffiliation: '',
          suffix: '',
          title: '',
        },
        meta: { status: 'PRISTINE', errorsList: [] }
      },
      signature: {
        meta: {
          status: 'DISABLED',
          errorsList: []
        },
        signedAppDocObjId: '',
      }
    }
  };
  return app;
}

function getITAgreements() {
  return [
    {
      name: 'it_agreement_software_updates',
      accepted: false,
    },
    {
      name: 'it_agreement_protect_data',
      accepted: false,
    },
    {
      name: 'it_agreement_monitor_access',
      accepted: false,
    },
    {
      name: 'it_agreement_destroy_copies',
      accepted: false,
    },
    {
      name: 'it_agreement_onboard_training',
      accepted: false,
    },
    {
      name: 'it_agreement_provide_institutional_policies',
      accepted: false,
    },
    {
      name: 'it_agreement_contact_daco_fraud',
      accepted: false,
    },
    {
      name: 'it_agreement_cloud_usage_risk',
      accepted: false,
    },
    {
      name: 'it_agreement_read_cloud_appendix',
      accepted: false,
    }
  ] ;
}

function getAppendixAgreements() {
  return [
    {
      name: 'appendix_icgc_goals_policies',
      accepted: false,
    },
    {
      name: 'appendix_large_scale_data_sharing',
      accepted: false,
    },
    {
      name: 'appendix_prepublication_policy',
      accepted: false,
    },
    {
      name: 'appendix_publication_policy',
      accepted: false,
    },
    {
      name: 'appendix_nih_genomic_inventions',
      accepted: false,
    },
    {
      name: 'appendix_oecd_genetic_inventions',
      accepted: false,
    },
    {
      name: 'appendix_cloud_security',
      accepted: false,
    },
    {
      name: 'appendix_ga4gh_framework',
      accepted: false,
    }
  ];
}

function getDataAccessAgreement() {
  return [
    {
      name: 'daa_correct_application_content',
      accepted: false,
    },
    {
      name: 'daa_agree_to_terms',
      accepted: false,
    },
  ];
}

async function hasReviewScope(identity: Identity) {
  const REVIEW_SCOPE = (await getAppConfig()).auth.REVIEW_SCOPE;
  const scopes = identity.tokenInfo.context.scope;
  return scopes.some(v => v == REVIEW_SCOPE);
}
