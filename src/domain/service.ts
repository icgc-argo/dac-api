import { Identity } from '@overture-stack/ego-token-middleware';
import { FilterQuery } from 'mongoose';
import { NotFound } from '../utils/errors';
import { getAppConfig } from '../config';
import { Application, AgreementItem, ApplicationSummary, SearchResult, State, Address, Error as SectionError, PersonalInfo } from './interface';
import { ApplicationDocument, ApplicationModel } from './model';
import moment from 'moment';
import 'moment-timezone';
import _ from 'lodash';
import { mergeKnown } from '../utils/misc';

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

  const appDocObj = appDoc.toObject();
  let merged: Application | undefined = undefined;

  // validations
  // validate no invalid state change
  if (appDoc.state == 'SIGN AND SUBMIT') {
    merged = appDocObj;
  }

  if (appDoc.state == 'DRAFT') {
    merged = updateAppStateForDraftApplication(appDocObj, appPart);
    const isReady = isReadyToSignAndSubmit(merged);
    if (!isReady) {
      appDoc.state = 'SIGN AND SUBMIT';
    }
  }

  if (!merged) {
    throw new Error();
  }

  // save / error
  merged.lastUpdatedAtUtc = new Date();
  merged.searchValues = getSearchFieldValues(merged);
  await ApplicationModel.updateOne({ appId: merged.appId }, merged);
}

function isReadyToSignAndSubmit(app: Application) {
  return false;
}

function validateRequired(val: string, name: string, errors: SectionError[]) {
  if (!val) {
    errors.push({
      field: name,
      message: `field ${name} is required`
    });
    return false;
  }
  return true;
}


function updateAppStateForDraftApplication(currentOriginal: Application, updatePart: Partial<Application>) {
  const current = _.cloneDeep(currentOriginal);

  if (updatePart.revisionRequest) {
    throw new Error('revision requests cannot be updated for a draft application');
  }

  if (updatePart.sections?.terms?.agreement.accepted !== undefined) {
    current.sections.terms.agreement.accepted = updatePart.sections?.terms.agreement.accepted;
  }

  if (updatePart.sections?.applicant) {
    current.sections.applicant = mergeKnown(current.sections.applicant, updatePart.sections.applicant);
    const info = current.sections.applicant.info;
    if (!!info.firstName.trim() && !!info.lastName.trim()) {
      current.sections.applicant.info.displayName = info.firstName.trim() + ' ' + info.lastName.trim();
    }
    validateApplicantSection(current);
  }

  if (updatePart.sections?.representative) {
    current.sections.applicant = mergeKnown(current.sections.representative, updatePart.sections.representative);
    const info = current.sections.representative.info;
    if (!!info.firstName.trim() && !!info.lastName.trim()) {
      current.sections.representative.info.displayName = info.firstName.trim() + ' ' + info.lastName.trim();
    }
    validateRepresentativeSection(current);
  }

  if (updatePart.sections?.projectInfo) {
    current.sections.projectInfo = mergeKnown(current.sections.projectInfo, updatePart.sections.projectInfo);
    validateProjectInfo(current);
  }

  if (updatePart.sections?.ethicsLetter) {
    current.sections.ethicsLetter = mergeKnown(current.sections.ethicsLetter, updatePart.sections.ethicsLetter);
  }

  if (updatePart.sections?.ITAgreements?.agreements) {
    mergeAgreementArray(current.sections.ITAgreements.agreements, updatePart.sections.ITAgreements.agreements);
  }

  if (updatePart.sections?.dataAccessAgreement?.agreements) {
    mergeAgreementArray(current.sections.dataAccessAgreement.agreements, updatePart.sections.dataAccessAgreement.agreements);
  }

  if (updatePart.sections?.appendices?.agreements) {
    mergeAgreementArray(current.sections.appendices.agreements, updatePart.sections.appendices.agreements);
  }

  return current;
}

function validateProjectInfo(app: Application) {
  const errors: SectionError[]  = [];
  const validations = [
    validateRequired(app.sections.projectInfo.title, 'title', errors),
    // todo: validate website url
    validateRequired(app.sections.projectInfo.background, 'background', errors),
    validateWordLength(app.sections.projectInfo.background, 200, 'background', errors),
    validateRequired(app.sections.projectInfo.aims, 'aims', errors),
    validateWordLength(app.sections.projectInfo.aims, 200, 'aims', errors),
    validateRequired(app.sections.projectInfo.methodology, 'methodology', errors),
    validateWordLength(app.sections.projectInfo.methodology, 200, 'methodology', errors),
  ];
  const valid = !validations.some(x => x == false);
  app.sections.projectInfo.meta.status = valid ? 'COMPLETE' : 'INCOMPLETE';
  app.sections.projectInfo.meta.errorsList = errors;
}

function validateWordLength(val: string, length: number, name: string, errors: SectionError[]) {
  if (val && countWords(val) > length) {
    errors.push({
      field: name,
      message: `field ${name} exceeded allowed number of words`
    });
    return false;
  }
  return true;
}

function countWords(str: string) {
  str = str.replace(/(^\s*)|(\s*$)/gi, '');
  str = str.replace(/[ ]{2,}/gi, ' ');
  str = str.replace(/\n /, '\n');
  return str.split(' ').length;
}

function validateRepresentativeSection(app: Application) {
  const errors: SectionError[] = [];
  const addressResult = validateAddress(app.sections.representative.address, errors);
  const infoResult = validatePersonalInfo(app.sections.representative.info, errors);
  app.sections.representative.meta.status = addressResult && infoResult ? 'COMPLETE' : 'INCOMPLETE';
  app.sections.representative.meta.errorsList = errors;
}

function validateApplicantSection(app: Application) {
  const applicantErrors: SectionError[] = [];
  const addressResult = validateAddress(app.sections.applicant.address, applicantErrors);
  const infoResult = validatePersonalInfo(app.sections.applicant.info, applicantErrors);
  app.sections.applicant.meta.status = addressResult && infoResult ? 'COMPLETE' : 'INCOMPLETE';
  app.sections.applicant.meta.errorsList = applicantErrors;
}

function validatePersonalInfo(info: PersonalInfo, errors: SectionError[]) {
  const validations = [
    validateRequired(info.firstName, 'firstName', errors),
    validateRequired(info.lastName, 'lastName', errors),
    validateRequired(info.googleEmail, 'googleEmail', errors),
    validateRequired(info.institutionEmail, 'institutionEmail', errors),
    validateRequired(info.primaryAffiliation, 'primaryAffiliation', errors),
    validateRequired(info.positionTitle, 'positionTitle', errors)
  ];

  return !validations.some(x => x == false);
}

function validateAddress(address: Address, errors: SectionError[]) {
  const validations = [
    validateRequired(address.streetAddress, 'streetAddress', errors),
    validateRequired(address.cityAndProvince, 'cityAndProvince', errors),
    validateRequired(address.country, 'country', errors),
    validateRequired(address.postalCode, 'postalCode', errors)
  ];
  return !validations.some(x => x == false);
}

function mergeAgreementArray(current: AgreementItem[], update: AgreementItem[]) {
  update.forEach(ai => {
    const name = ai.name;
    const target = current.find(a => a.name == name);
    if (!target) return;
    target.accepted = ai.accepted;
  });
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

function getSearchFieldValues(appDoc: Application) {
  return [
    appDoc.appId,
    appDoc.state,
    appDoc.sections.ethicsLetter.declaredAsRequired ? 'yes' : 'no',
    // this will be ET to match admin location when they do search
    moment(appDoc.lastUpdatedAtUtc).tz('ET').format('YYYY-MM-DD'),
    appDoc.expiresAtUtc ? moment(appDoc.expiresAtUtc).tz('America/Toronto').format('YYYY-MM-DD') : '',
    appDoc.sections.applicant.info.displayName,
    appDoc.sections.applicant.info.googleEmail,
    appDoc.sections.applicant.info.primaryAffiliation,
  ].filter(x => !(x === null || x === undefined || x.trim() === ''));
}
