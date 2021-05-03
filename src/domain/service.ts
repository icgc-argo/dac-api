import { FilterQuery } from 'mongoose';
import { getAppConfig } from '../config';
import { Identity } from '../utils/identity';
import { Application, ApplicationSummary, SearchResult } from './interface';
import { ApplicationDocument, ApplicationModel } from './model';

export async function create(identity: Identity) {
  const app = emptyApp(identity.userId);
  const appDoc = await ApplicationModel.create(app);
  const copy = {...appDoc.toObject(), appId:  `DACO-${appDoc.appId}` };
  return copy;
}

export async function search(identity: Identity): Promise<SearchResult> {
  const isAdminOrReviewerResult = await canSeeAnyApplication(identity);
  const query: FilterQuery<ApplicationDocument> = {};
  if (!isAdminOrReviewerResult) {
    query.submitterId = identity.userId;
  }
  const apps = await ApplicationModel.find(query).exec();
  const copy = apps.map(app => ({
      appId:  `DACO-${app.appId}`,
      applicant: { info: app.sections.applicant.info},
      submitterId: app.submitterId,
      approvedAtUtc: app.approvedAtUtc,
      closedAtUtc: app.closedAtUtc,
      closedBy: app.closedBy,
      expiresAtUtc: app.expiresAtUtc,
      state: app.state,
      submittedAtUtc: app.submittedAtUtc,
    } as ApplicationSummary)
  );
  return {
    pagingInfo: {
      totalCount: 10,
      pagesCount: 2,
      pageSize: 5,
      index: 0,
    },
    items: copy
  };
}


export async function getById(id: number, identity: Identity) {
  const isAdminOrReviewerResult = await canSeeAnyApplication(identity);
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
  const copy = {...app.toObject(), appId:  `DACO-${app.appId}` };
  return copy;
}

function getITAgreements() {
  return [
    {
      name: 'A',
      accepted: false,
    },
    {
      name: 'B',
      accepted: false,
    },
    {
      name: 'C',
      accepted: false,
    },
    {
      name: 'D',
      accepted: false,
    }
  ] ;
}

function emptyApp(userId: string): Partial<Application> {
  const app: Partial<Application> = {
    state: 'DRAFT',
    submitterId: userId,
    revisionRequest: {
      applicant: {
        details: '',
        requested: false,
      },
      collaborators: {
        details: '',
        requested: false,
      },
      general: {
        details: '',
        requested: false,
      },
      projectInfo: {
        details: '',
        requested: false,
      },
      representative: {
        details: '',
        requested: false,
      },
      signature: {
        details: '',
        requested: false
      }
    },
    sections: {
      collaborators: {
        meta: {status: '', errors: []},
        list: [],
      },
      ITAgreements: {
        meta: {status: '', errors: []},
        agreements: getITAgreements()
      },
      appendices: {
        meta: {status: '', errors: []},
        agreements: getITAgreements()
      },
      dataAccessAgreement: {
        meta: {status: '', errors: []},
        agreements: getITAgreements()
      },
      terms: {
        meta: {status: '', errors: []},
        agreement: {
          accepted: false,
          name: 'TT'
        }
      },

      applicant: {
        meta: {status: '', errors: []},
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
        abstract: '',
        laySummary: '',
        website: '',
        title: '',
        pubMedIDs: [],
        meta: { status: '', errors: [] }
      },
      ethicsLetter: {
        approvalLetterObjId: undefined,
        declaredAsRequired: undefined,
        doesExpire: false,
        expiryDateUtc: undefined,
        meta: { status: '', errors: [] }
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
          institutionWebsite: '',
          lastName: '',
          middleName: '',
          positionTitle: '',
          primaryAffiliation: '',
          suffix: '',
          title: '',
        },
        meta: { status: '', errors: [] }
      }
    }
  };
  return app;
}

async function canSeeAnyApplication(identity: Identity) {
  const REVIEW_SCOPE = (await getAppConfig()).auth.REVIEW_SCOPE;
  const ADMIN_SCOPE = (await getAppConfig()).auth.ADMIN_SCOPE;
  const scopes = identity.context.scope;
  return scopes.some(v => v == REVIEW_SCOPE || v == ADMIN_SCOPE);
}
