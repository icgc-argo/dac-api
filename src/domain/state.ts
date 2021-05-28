import { mergeKnown } from '../utils/misc';
import moment from 'moment';
import 'moment-timezone';
import _ from 'lodash';
import validator from 'validate.js';
import {
  Application,
  Address,
  SectionError,
  PersonalInfo,
  TERMS_AGREEMENT_NAME,
  IT_AGREEMENT_PROTECT_DATA,
  IT_AGREEMENT_MONITOR_ACCESS,
  IT_AGREEMENT_SOFTWARE_UPDATES,
  IT_AGREEMENT_DESTROY_COPIES,
  IT_AGREEMENT_ONBOARD_TRAINING,
  IT_AGREEMENT_PROVIDE_INSTITUTIONAL_POLICIES,
  IT_AGREEMENT_CONTACT_DACO_FRAUD,
  IT_AGREEMENT_CLOUD_USAGE_RISK,
  IT_AGREEMENT_READ_CLOUD_APPENDIX,
  APPENDIX_ICGC_GOALS_POLICIES,
  APPENDIX_LARGE_SCALE_DATA_SHARING,
  APPENDIX_PREPUBLICATION_POLICY,
  APPENDIX_PUBLICATION_POLICY,
  APPENDIX_NIH_GENOMIC_INVENTIONS,
  APPENDIX_OECD_GENETIC_INVENTIONS,
  APPENDIX_CLOUD_SECURITY,
  APPENDIX_GA4GH_FRAMEWORK,
  DAA_CORRECT_APPLICATION_CONTENT,
  DAA_AGREE_TO_TERMS, UpdateApplication, AgreementItem
} from './interface';
import { Identity } from '@overture-stack/ego-token-middleware';

export class ApplicationStateManager {
  private currentApplication: Application;

  constructor(application: Application) {
    this.currentApplication = _.cloneDeep(application);
  }

  updateApp(updatePart: Partial<UpdateApplication>, isReviewer: boolean) {
    let merged: Application | undefined = undefined;

    switch (this.currentApplication.state) {
      case 'APPROVED':
        merged = updateAppStateForApprovedApplication(this.currentApplication, updatePart, isReviewer);
        break;
      case 'REVISIONS REQUESTED':
        merged = updateAppStateForRetrunedApplication(this.currentApplication, updatePart);
        const shouldSubmit = isReadyToSignAndSubmit(merged);
        if (shouldSubmit) {
          merged.sections.signature.meta.status = 'REVISIONS REQUESTED';
          merged.state = 'SIGN AND SUBMIT';
        } else {
          merged.sections.signature.meta.status = 'DISABLED';
          merged.state = 'REVISIONS REQUESTED';
        }
        break;

      case 'REVIEW':
        // we are updating an application in review state (admin wants to a. approve, b. reject, c. request revisions)
        if (!isReviewer) {
          throw new Error('not allowed');
        }
        merged = updateAppInReview(this.currentApplication, updatePart);
        break;

      case 'SIGN AND SUBMIT':
        merged = updateAppStateForSignAndSubmit(this.currentApplication, updatePart);
        break;

      case 'DRAFT':
        merged = updateAppStateForDraftApplication(this.currentApplication, updatePart);
        // check if it's ready to move to the next state [DRAFT => SIGN & SUBMIT]
        const isReady = isReadyToSignAndSubmit(merged);
        if (isReady) {
          merged.sections.signature.meta.status = 'PRISTINE';
          merged.state = 'SIGN AND SUBMIT';
        } else {
          merged.sections.signature.meta.status = 'DISABLED';
          merged.state = 'DRAFT';
        }
        break;
    }

    if (!merged) {
      throw new Error();
    }

    // save / error
    merged.lastUpdatedAtUtc = new Date();
    merged.searchValues = getSearchFieldValues(merged);
    return merged;
  }
}

function updateAppInReview(currentApplication: Readonly<Application>, updatePart: Partial<UpdateApplication>) {
  const current = _.cloneDeep(currentApplication) as Application;

  // if the admin has chosen a custom expiry date
  if (updatePart.expiresAtUtc) {
    current.expiresAtUtc = updatePart.expiresAtUtc;
  }

  // admin wants to approve the app
  if (updatePart.state == 'APPROVED') {
    current.state = 'APPROVED';
    const now = new Date();

    // if the admin hasn't set a custom expiry date
    if (!updatePart.expiresAtUtc) {
      current.expiresAtUtc = moment().add(1, 'year').toDate();
    }

    return current;
  }

  if (updatePart.state == 'REJECTED') {
    current.state = 'REJECTED';
    current.denialReason = updatePart.denialReason || '';
    return current;
  }

  if (updatePart.state == 'REVISIONS REQUESTED') {
    current.state = 'REVISIONS REQUESTED';
    current.revisionRequest = mergeKnown(current.revisionRequest, updatePart.revisionRequest);
    // iterate over revision sections and update their state
    return current;
  }
}

function updateAppStateForSignAndSubmit(currentApplication: Readonly<Application>, updatePart: Partial<UpdateApplication>) {
  const current = _.cloneDeep(currentApplication) as Application;
  // applicant wants to submit the app
  if (updatePart.state == 'REVIEW') {
    const ready = isReadyForReview(current);
    if (ready) {
      current.state = 'REVIEW';
      // reset revision request section
      current.revisionRequest = emptyRevisionRequest();
    }
    return current;
  }

  // applicant wants to update the signed document
  const uploadedDocId = updatePart.sections?.signature?.signedAppDocObjId;
  const validDocId = validateUploadedDocument(uploadedDocId);

  if (!uploadedDocId || !validDocId) {
    current.sections.signature.meta.errorsList.push({
      field: 'signedDocument',
      message: 'invalid document Id'
    });
    current.sections.signature.meta.status = 'INCOMPLETE';
    return current;
  }

  current.sections.signature.signedAppDocObjId = uploadedDocId;
  current.sections.signature.meta.status = 'COMPLETE';
  return current;
}

function validateUploadedDocument(uploadedDocId: string | undefined) {
  return true;
}

function isReadyForReview(application: Application) {
  if (application.sections.signature.meta.status !== 'COMPLETE') {
    return false;
  }
  return true;
}

function updateAppStateForApprovedApplication(currentApplication: Application, updatePart: Partial<UpdateApplication>, isReviewer: boolean) {
  const current = _.cloneDeep(currentApplication);
  updateEthics(updatePart, current);
  return current;
}


function updateAppStateForRetrunedApplication(currentApplication: Application, updatePart: Partial<UpdateApplication>) {
  const current = _.cloneDeep(currentApplication);
  updateApplicationSection(updatePart, current);
  updateRepresentative(updatePart, current);
  updateProjectInfo(updatePart, current);
  updateEthics(updatePart, current);
  return current;
}

function updateAppStateForDraftApplication(currentApplication: Application, updatePart: Partial<UpdateApplication>) {
  const current = _.cloneDeep(currentApplication);
  updateTerms(updatePart, current);
  updateApplicationSection(updatePart, current);
  updateRepresentative(updatePart, current);
  updateProjectInfo(updatePart, current);
  updateEthics(updatePart, current);
  updateITAgreements(updatePart, current);
  updateDataAccessAgreements(updatePart, current);
  updateAppendices(updatePart, current);
  return current;
}


function updateAppendices(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.appendices?.agreements) {
    mergeAgreementArray(current.sections.appendices.agreements, updatePart.sections.appendices.agreements);
    validateAppendices(current);
  }
}

function updateDataAccessAgreements(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.dataAccessAgreement?.agreements) {
    mergeAgreementArray(current.sections.dataAccessAgreement.agreements, updatePart.sections.dataAccessAgreement.agreements);
    validateDataAccessAgreement(current);
  }
}

function updateITAgreements(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.ITAgreements?.agreements) {
    mergeAgreementArray(current.sections.ITAgreements.agreements, updatePart.sections.ITAgreements.agreements);
    validateITAgreement(current);
  }
}

function updateEthics(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.ethicsLetter) {
    // TODO: after approval ethics letter declaration cannot be changed.
    current.sections.ethicsLetter = mergeKnown(current.sections.ethicsLetter, updatePart.sections.ethicsLetter);
    validateEthicsLetterSection(current);
  }
}

function updateProjectInfo(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.projectInfo) {
    current.sections.projectInfo = mergeKnown(current.sections.projectInfo, updatePart.sections.projectInfo);
    validateProjectInfo(current);
  }
}

function updateTerms(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.terms?.agreement.accepted !== undefined) {
    current.sections.terms.agreement.accepted = updatePart.sections?.terms.agreement.accepted;
    if (current.sections.terms.agreement.accepted) {
      current.sections.terms.meta.status = 'COMPLETE';
    } else {
      current.sections.terms.meta.status = 'INCOMPLETE';
    }
  }
}

function updateRepresentative(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.representative) {
    current.sections.applicant = mergeKnown(current.sections.representative, updatePart.sections.representative);
    const info = current.sections.representative.info;
    if (!!info.firstName.trim() && !!info.lastName.trim()) {
      current.sections.representative.info.displayName = info.firstName.trim() + ' ' + info.lastName.trim();
    }
    validateRepresentativeSection(current);
  }
}

function updateApplicationSection(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.applicant) {
    current.sections.applicant = mergeKnown(current.sections.applicant, updatePart.sections.applicant);
    const info = current.sections.applicant.info;
    if (!!info.firstName.trim() && !!info.lastName.trim()) {
      current.sections.applicant.info.displayName = info.firstName.trim() + ' ' + info.lastName.trim();
    }
    validateApplicantSection(current);
  }
}

function validateITAgreement(app: Application) {
  const result = validateAgreementArray(app.sections.ITAgreements.agreements);
  if (!result) {
    app.sections.ITAgreements.meta.status = 'INCOMPLETE';
    return;
  }
  app.sections.ITAgreements.meta.status = 'COMPLETE';
}

function validateAppendices(app: Application) {
  const result = validateAgreementArray(app.sections.appendices.agreements);
  if (!result) {
    app.sections.appendices.meta.status = 'INCOMPLETE';
    return;
  }
  app.sections.appendices.meta.status = 'COMPLETE';
}


function validateEthicsLetterSection(app: Application) {
  const needsLetter = app.sections.ethicsLetter.declaredAsRequired;
  const errors: SectionError[] = [];
  const declared = validateRequired(needsLetter, 'needsLetter', errors);
  if (!declared) {
    app.sections.ethicsLetter.meta.status = 'INCOMPLETE';
    return false;
  }

  if (needsLetter) {
    if (app.sections.ethicsLetter.approvalLetterDocs.length == 0) {
      app.sections.ethicsLetter.meta.status = 'INCOMPLETE';
      errors.push({
        field: 'approvalLetterDocs',
        message: 'At least one ethics letter is required'
      });
    }
    return false;
  }

  app.sections.ethicsLetter.meta.status = 'COMPLETE';
  app.sections.ethicsLetter.meta.errorsList = errors;
  return true;
}

function validateDataAccessAgreement(app: Application) {
  const result = validateAgreementArray(app.sections.dataAccessAgreement.agreements);
  if (!result) {
    app.sections.dataAccessAgreement.meta.status = 'INCOMPLETE';
    return;
  }
  app.sections.dataAccessAgreement.meta.status = 'COMPLETE';
}

function validateAgreementArray(ags: AgreementItem[]) {
  const incomplete = ags.some(ag => {
    ag.accepted !== true;
  });
  return !incomplete;
}

function validateProjectInfo(app: Application) {
  const errors: SectionError[] = [];
  const validations = [
    validateRequired(app.sections.projectInfo.title, 'title', errors),
    validateUrl(app.sections.projectInfo.website, 'website', errors),
    validateRequired(app.sections.projectInfo.background, 'background', errors),
    validateWordLength(app.sections.projectInfo.background, 200, 'background', errors),
    validateRequired(app.sections.projectInfo.aims, 'aims', errors),
    validateWordLength(app.sections.projectInfo.aims, 200, 'aims', errors),
    validateRequired(app.sections.projectInfo.methodology, 'methodology', errors),
    validateWordLength(app.sections.projectInfo.methodology, 200, 'methodology', errors),
    validatePublications(app.sections.projectInfo.publicationsURLs, errors),
  ];
  const valid = !validations.some(x => x == false);
  app.sections.projectInfo.meta.status = valid ? 'COMPLETE' : 'INCOMPLETE';
  app.sections.projectInfo.meta.errorsList = errors;
}

function validateUrl(val: string, name: string, errors: SectionError[]) {
  const error: string[] | undefined = validator.single(val, {
    url: true
  });
  if (error) {
    errors.push({
      field: name,
      message: 'Value is not a valid URL'
    });
    return false;
  }
  return true;
}

function validatePublications(publications: string[], errors: SectionError[]) {
  const uniquePubs = _.uniq(publications);
  if (uniquePubs.length < 3) {
    errors.push({
      field: 'publications',
      message: 'you need at least 3 unique publications URLs'
    });
    return false;
  }

  const validations = uniquePubs.map((p: string, index: number) => {
    return validateUrl(p, `publications.${index}`, errors);
  });

  return !validations.some(x => !x);
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

function isReadyToSignAndSubmit(app: Application) {
  const sections = app.sections;
  return sections.terms.meta.status == 'COMPLETE'
    && sections.applicant.meta.status == 'COMPLETE'
    && sections.representative.meta.status == 'COMPLETE'
    && sections.projectInfo.meta.status == 'COMPLETE'
    && sections.ethicsLetter.meta.status == 'COMPLETE'
    && sections.ITAgreements.meta.status == 'COMPLETE'
    && sections.dataAccessAgreement.meta.status == 'COMPLETE'
    && sections.appendices.meta.status == 'COMPLETE';
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


function validateRequired(val: string | boolean | null | undefined, name: string, errors: SectionError[]) {
  if (typeof val == 'boolean') {
    return val !== null && val !== undefined;
  }
  if (!val || val.trim() == '') {
    errors.push({
      field: name,
      message: `field ${name} is required`
    });
    return false;
  }
  return true;
}

export function getSearchFieldValues(appDoc: Application) {
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


export function newApplication(identity: Identity): Partial<Application> {
  const app: Partial<Application> = {
    state: 'DRAFT',
    submitterId: identity.userId,
    submitterEmail: identity.tokenInfo.context.user.email,
    revisionRequest: emptyRevisionRequest(),
    sections: {
      collaborators: {
        meta: { status: 'PRISTINE', errorsList: [] },
        list: [],
      },
      ITAgreements: {
        meta: { status: 'PRISTINE', errorsList: [] },
        agreements: getITAgreements()
      },
      appendices: {
        meta: { status: 'PRISTINE', errorsList: [] },
        agreements: getAppendixAgreements()
      },
      dataAccessAgreement: {
        meta: { status: 'PRISTINE', errorsList: [] },
        agreements: getDataAccessAgreement()
      },
      terms: {
        meta: { status: 'PRISTINE', errorsList: [] },
        agreement: {
          accepted: false,
          name: TERMS_AGREEMENT_NAME
        }
      },
      applicant: {
        meta: { status: 'PRISTINE', errorsList: [] },
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
        approvalLetterDocs: [],
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
      name: IT_AGREEMENT_SOFTWARE_UPDATES,
      accepted: false,
    },
    {
      name: IT_AGREEMENT_PROTECT_DATA,
      accepted: false,
    },
    {
      name: IT_AGREEMENT_MONITOR_ACCESS,
      accepted: false,
    },
    {
      name: IT_AGREEMENT_DESTROY_COPIES,
      accepted: false,
    },
    {
      name: IT_AGREEMENT_ONBOARD_TRAINING,
      accepted: false,
    },
    {
      name: IT_AGREEMENT_PROVIDE_INSTITUTIONAL_POLICIES,
      accepted: false,
    },
    {
      name: IT_AGREEMENT_CONTACT_DACO_FRAUD,
      accepted: false,
    },
    {
      name: IT_AGREEMENT_CLOUD_USAGE_RISK,
      accepted: false,
    },
    {
      name: IT_AGREEMENT_READ_CLOUD_APPENDIX,
      accepted: false,
    }
  ];
}

function getAppendixAgreements() {
  return [
    {
      name: APPENDIX_ICGC_GOALS_POLICIES,
      accepted: false,
    },
    {
      name: APPENDIX_LARGE_SCALE_DATA_SHARING,
      accepted: false,
    },
    {
      name: APPENDIX_PREPUBLICATION_POLICY,
      accepted: false,
    },
    {
      name: APPENDIX_PUBLICATION_POLICY,
      accepted: false,
    },
    {
      name: APPENDIX_NIH_GENOMIC_INVENTIONS,
      accepted: false,
    },
    {
      name: APPENDIX_OECD_GENETIC_INVENTIONS,
      accepted: false,
    },
    {
      name: APPENDIX_CLOUD_SECURITY,
      accepted: false,
    },
    {
      name: APPENDIX_GA4GH_FRAMEWORK,
      accepted: false,
    }
  ];
}

function getDataAccessAgreement() {
  return [
    {
      name: DAA_CORRECT_APPLICATION_CONTENT,
      accepted: false,
    },
    {
      name: DAA_AGREE_TO_TERMS,
      accepted: false,
    },
  ];
}
export function emptyRevisionRequest() {
  return {
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
    ethicsLetter: {
      details: '',
      requested: false,
    },
    signature: {
      details: '',
      requested: false
    }
  };
}