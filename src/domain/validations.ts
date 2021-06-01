import { BadRequest } from '../utils/errors';
import { Address, AgreementItem, Application, Collaborator, PersonalInfo, SectionError } from './interface';
import validator from 'validate.js';
import _ from 'lodash';

export function validateId(id: string) {
  if (!id) {
    throw new BadRequest('id is required');
  }
  if (!id.startsWith('DACO-')) {
    throw new BadRequest('Invalid id');
  }
  const numericId = id.replace('DACO-', '');
  if (Number(numericId) == NaN) {
    throw new BadRequest('Invalid id');
  }
}

export function validateRepresentativeSection(app: Application) {
  const errors: SectionError[] = [];
  let addressResult = true;
  if (!app.sections.representative.addressSameAsApplicant) {
    addressResult = validateAddress(app.sections.representative.address, errors);
  }
  const infoResult = validatePersonalInfo(app.sections.representative.info, errors);
  app.sections.representative.meta.status = addressResult && infoResult ? 'COMPLETE' : 'INCOMPLETE';
  app.sections.representative.meta.errorsList = errors;
}

export function validateApplicantSection(app: Application) {
  const applicantErrors: SectionError[] = [];
  const addressResult = validateAddress(app.sections.applicant.address, applicantErrors);
  const infoResult = validatePersonalInfo(app.sections.applicant.info, applicantErrors);
  app.sections.applicant.meta.status = addressResult && infoResult ? 'COMPLETE' : 'INCOMPLETE';
  app.sections.applicant.meta.errorsList = applicantErrors;
}

export function validateITAgreement(app: Application) {
  const result = validateAgreementArray(app.sections.ITAgreements.agreements);
  if (!result) {
    app.sections.ITAgreements.meta.status = 'INCOMPLETE';
    return;
  }
  app.sections.ITAgreements.meta.status = 'COMPLETE';
}

export function validateAppendices(app: Application) {
  const result = validateAgreementArray(app.sections.appendices.agreements);
  if (!result) {
    app.sections.appendices.meta.status = 'INCOMPLETE';
    return;
  }
  app.sections.appendices.meta.status = 'COMPLETE';
}

export function validateEthicsLetterSection(app: Application) {
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

export function validateDataAccessAgreement(app: Application) {
  const result = validateAgreementArray(app.sections.dataAccessAgreement.agreements);
  if (!result) {
    app.sections.dataAccessAgreement.meta.status = 'INCOMPLETE';
    return;
  }
  app.sections.dataAccessAgreement.meta.status = 'COMPLETE';
}

export function validateAgreementArray(ags: AgreementItem[]) {
  const incomplete = ags.some(ag => {
    ag.accepted !== true;
  });
  return !incomplete;
}

export function validateCollaborator(collaborator: Collaborator) {
  const errors: SectionError[] = [];
  const validations = [
    validatePersonalInfo(collaborator.info, errors),
    validateRequired(collaborator.type, 'type' , errors)
  ];
  const valid = !validations.some(x => x == false);
  return { valid, errors };
}

export function validateProjectInfo(app: Application) {
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

function validateEmail(val: string, name: string, errors: SectionError[]) {
  if (!val) {
    return true;
  }
  const error: string[] | undefined = validator.single(val, {
    email: true
  });

  if (error) {
    errors.push({
      field: name,
      message: 'Value is not a valid email'
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

function validatePersonalInfo(info: PersonalInfo, errors: SectionError[]) {
  const validations = [
    validateRequired(info.firstName, 'firstName', errors),
    validateRequired(info.lastName, 'lastName', errors),
    validateRequired(info.googleEmail, 'googleEmail', errors),
    validateEmail(info.googleEmail, 'googleEmail', errors),
    validateRequired(info.institutionEmail, 'institutionEmail', errors),
    validateEmail(info.institutionEmail, 'institutionEmail', errors),
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
