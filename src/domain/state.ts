import { mergeKnown } from '../utils/misc';
import { Address, AgreementItem, Application, PersonalInfo, SectionError } from './interface';
import moment from 'moment';
import 'moment-timezone';
import _ from 'lodash';

export class ApplicationStateManager {
  private currentApplication: Application;

  constructor(application: Application) {
    this.currentApplication =  _.cloneDeep(application);
  }

  updateApp(updatePart: Partial<Application>) {
    let merged: Application | undefined = undefined;

    // we are updating an application in review state (admin wants to a. approve, b. reject, c. request revisions)
    if (this.currentApplication.state == 'REVIEW') {

    }

    if (this.currentApplication.state == 'SIGN AND SUBMIT') {
      merged = updateAppStateForSignAndSubmit(this.currentApplication, updatePart);
    }

    if (this.currentApplication.state == 'DRAFT') {
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

function updateAppStateForSignAndSubmit(currentApplication: Readonly<Application>, updatePart: Partial<Application>) {
  const current = _.cloneDeep(currentApplication) as Application;
  // applicant wants to submit the app
  if (current.state == 'SIGN AND SUBMIT' && updatePart.state == 'REVIEW') {
    const ready = isReadyForReview(current);
    if (ready) {
      current.state = 'REVIEW';
    }
    return current;
  }

  // applicant wants to update the signed document
  const uploadedDocId = updatePart.sections?.signature.signedAppDocObjId;
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

function updateAppStateForDraftApplication(currentApplication: Application, updatePart: Partial<Application>) {
  const current = _.cloneDeep(currentApplication);

  if (updatePart.sections?.terms?.agreement.accepted !== undefined) {
    current.sections.terms.agreement.accepted = updatePart.sections?.terms.agreement.accepted;
    if (current.sections.terms.agreement.accepted) {
      current.sections.terms.meta.status = 'COMPLETE';
    } else {
      current.sections.terms.meta.status = 'INCOMPLETE';
    }
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
    validateEthicsLetterSection(current);
  }

  if (updatePart.sections?.ITAgreements?.agreements) {
    mergeAgreementArray(current.sections.ITAgreements.agreements, updatePart.sections.ITAgreements.agreements);
    validateITAgreement(current);
  }

  if (updatePart.sections?.dataAccessAgreement?.agreements) {
    mergeAgreementArray(current.sections.dataAccessAgreement.agreements, updatePart.sections.dataAccessAgreement.agreements);
    validateDataAccessAgreement(current);
  }

  if (updatePart.sections?.appendices?.agreements) {
    mergeAgreementArray(current.sections.appendices.agreements, updatePart.sections.appendices.agreements);
    validateAppendices(current);
  }

  return current;
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

  app.sections.ethicsLetter.meta, status = 'COMPLETE';
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
