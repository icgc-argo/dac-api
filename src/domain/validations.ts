import { BadRequest } from '../utils/errors';
import {
  Address,
  AgreementItem,
  Application,
  Collaborator,
  PersonalInfo,
  SectionError,
  SectionStatus,
} from './interface';
import validator from 'validate.js';
import _, { uniq } from 'lodash';
import { countriesList } from '../utils/constants';
import { c } from '../utils/misc';

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
    addressResult = validateAddress(c(app.sections.representative.address), errors);
  }
  const validations = [
    validatePersonalInfo(app.sections.representative.info, errors, false),
    validatePrimaryAffiliationMatching(
      app.sections.representative.info.primaryAffiliation,
      app.sections.applicant.info.primaryAffiliation,
      errors,
    ),
  ];

  const isValid = addressResult && !validations.some((x) => x === false);
  return { isValid, errors };
}

export const validateNoMatchingApplicant = (
  app: Application,
  collaborator: Collaborator,
  errors: SectionError[],
) => {
  const matchesApplicantGmail =
    collaborator.info.googleEmail === app.sections.applicant.info.googleEmail;
  const matchesApplicantInstitutionEmail =
    collaborator.info.institutionEmail === app.sections.applicant.info.institutionEmail;

  if (matchesApplicantGmail || matchesApplicantInstitutionEmail) {
    if (matchesApplicantGmail) {
      errors.push({
        field: 'googleEmail',
        message: 'The applicant does not need to be added as a collaborator.',
      });
    }
    if (matchesApplicantInstitutionEmail) {
      errors.push({
        field: 'institutionEmail',
        message: 'The applicant does not need to be added as a collaborator.',
      });
    }
    return false;
  }
  return true;
};

export function validateApplicantSection(app: Application) {
  const applicantErrors: SectionError[] = [];
  const addressResult = validateAddress(app.sections.applicant.address, applicantErrors);
  const infoResult = validatePersonalInfo(app.sections.applicant.info, applicantErrors, true, true);
  app.sections.applicant.meta.status = addressResult && infoResult ? 'COMPLETE' : 'INCOMPLETE';
  app.sections.applicant.meta.errorsList = applicantErrors;
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

  if (needsLetter && app.sections.ethicsLetter.approvalLetterDocs.length == 0) {
    app.sections.ethicsLetter.meta.status = 'INCOMPLETE';
    errors.push({
      field: 'approvalLetterDocs',
      message: 'At least one ethics letter is required',
    });
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
  const incomplete = ags.some((ag) => ag.accepted !== true);
  return !incomplete;
}

export function validateCollaborator(
  collaborator: Collaborator,
  application: Application,
  shouldValidateNoMatchingApplicant: boolean = false,
) {
  const errors: SectionError[] = [];
  const validations = [
    validatePersonalInfo(collaborator.info, errors),
    validateRequired(collaborator.type, 'type', errors),
    validatePrimaryAffiliationMatching(
      collaborator.info.primaryAffiliation,
      application.sections.applicant.info.primaryAffiliation,
      errors,
    ),
    shouldValidateNoMatchingApplicant
      ? validateNoMatchingApplicant(application, collaborator, errors)
      : true,
  ];
  const valid = !validations.some((x) => x == false);
  return { valid, errors };
}

export function validateProjectInfo(app: Application) {
  const errors: SectionError[] = [];
  const validations = [
    validateRequired(app.sections.projectInfo.title, 'title', errors),
    validateUrl(app.sections.projectInfo.website, 'website', errors),
    validateRequired(app.sections.projectInfo.background, 'background', errors),
    validateWordMax(app.sections.projectInfo.background, 200, 'background', errors),
    validateRequired(app.sections.projectInfo.aims, 'aims', errors),
    validateWordMax(app.sections.projectInfo.aims, 200, 'aims', errors),
    validateRequired(app.sections.projectInfo.summary, 'summary', errors),
    validateWordMax(app.sections.projectInfo.summary, 200, 'summary', errors),
    validateWordMin(app.sections.projectInfo.summary, 100, 'summary', errors),
    validateRequired(app.sections.projectInfo.methodology, 'methodology', errors),
    validateWordMax(app.sections.projectInfo.methodology, 200, 'methodology', errors),
    validatePublications(app.sections.projectInfo.publicationsURLs, errors),
  ];
  const valid = !validations.some((x) => x == false);
  app.sections.projectInfo.meta.status = valid ? 'COMPLETE' : 'INCOMPLETE';
  app.sections.projectInfo.meta.errorsList = errors;
}

export function validatePrimaryAffiliationMatching(
  val: string,
  referenceVal: string,
  errors: SectionError[],
) {
  if (!referenceVal) {
    return true;
  }
  if (val === referenceVal) {
    return true;
  }

  errors.push({
    field: 'primaryAffiliation',
    message: 'Primary Affiliation must be the same as the Applicant',
  });
  return false;
}

function validateUrl(val: string | undefined, name: string, errors: SectionError[]) {
  if (!val) {
    return true;
  }
  const error: string[] | undefined = validator.single(val, {
    url: true,
  });

  if (error) {
    errors.push({
      field: name,
      message: 'Value is not a valid URL',
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
    email: true,
  });

  if (error) {
    errors.push({
      field: name,
      message: 'Value is not a valid email',
    });
    return false;
  }
  return true;
}

function validatePublications(publications: string[], errors: SectionError[]) {
  const minPublicationsURLs = 3;
  const fieldErrors = {
    duplicate: 'Publications URLs must be unique.',
    empty: 'This field is required.',
    invalid: 'Invalid publication URL.',
    none: '',
  };
  const sectionErrors = {
    duplicate: 'Publications URLs must be unique.',
    empty: 'Publication URL fields are required.',
    incomplete: `You need at least ${minPublicationsURLs} valid, unique publications URLs.`,
    invalid: 'Publications URLs must be valid URLs.',
    none: '',
    other: 'There was a problem with your submission.',
  };

  // handle individual field errors

  const fieldValidations = publications.map((publication: string, index: number) => {
    const isInvalidURL: boolean = !!validator.single(publication, {
      url: true,
    });
    const isDuplicate: boolean = publications.filter((p) => p === publication).length > 1;

    const message =
      publication === ''
        ? fieldErrors.empty
        : isInvalidURL
        ? fieldErrors.invalid
        : isDuplicate
        ? fieldErrors.duplicate
        : fieldErrors.none;

    if (message) {
      errors.push({
        field: `publications.${index}`,
        message,
      });
    }

    return message;
  });

  // handle publications URLs section errors

  const isIncomplete =
    fieldValidations.filter((f) => f === fieldErrors.none).length < minPublicationsURLs;
  const hasEmptyFields = fieldValidations.some((f) => f === fieldErrors.empty);
  const hasInvalidURLs = fieldValidations.some((f) => f === fieldErrors.invalid);
  const hasDuplicates = fieldValidations.some((f) => f === fieldErrors.duplicate);
  const hasErrors = fieldValidations.some((f) => f !== fieldErrors.none);

  const message = isIncomplete
    ? sectionErrors.incomplete
    : hasEmptyFields
    ? sectionErrors.empty
    : hasInvalidURLs
    ? sectionErrors.invalid
    : hasDuplicates
    ? sectionErrors.duplicate
    : hasErrors
    ? sectionErrors.other
    : sectionErrors.none;

  if (message) {
    errors.push({
      field: 'publications',
      message,
    });
  }

  return !message;
}

function validateWordMax(val: string, length: number, name: string, errors: SectionError[]) {
  if (val && countWords(val) > length) {
    errors.push({
      field: name,
      message: `field ${name} exceeded allowed number of words`,
    });
    return false;
  }
  return true;
}

function validateWordMin(val: string, length: number, name: string, errors: SectionError[]) {
  if (val && countWords(val) < length) {
    errors.push({
      field: name,
      message: `field ${name} didn't meet minimum number of words`,
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

function validatePersonalInfo(
  info: PersonalInfo,
  errors: SectionError[],
  validateGoogleEmailRequired: boolean = true,
  validateWebsiteRequired: boolean = false,
) {
  const validations = [
    validateRequired(info.firstName, 'firstName', errors),
    validateRequired(info.lastName, 'lastName', errors),
    validateGoogleEmailRequired ? validateRequired(info.googleEmail, 'googleEmail', errors) : true,
    validateEmail(info.googleEmail, 'googleEmail', errors),
    validateRequired(info.institutionEmail, 'institutionEmail', errors),
    validateEmail(info.institutionEmail, 'institutionEmail', errors),
    validateRequired(info.primaryAffiliation, 'primaryAffiliation', errors),
    validateRequired(info.positionTitle, 'positionTitle', errors),
    validateUrl(info.website, 'website', errors),
    validateWebsiteRequired ? validateRequired(info.website, 'website', errors) : true,
  ];

  return !validations.some((x) => x == false);
}

function validateAddress(address: Address, errors: SectionError[]) {
  const validations = [
    validateRequired(address.streetAddress, 'streetAddress', errors),
    validateRequired(address.cityAndProvince, 'cityAndProvince', errors),
    validateRequired(address.country, 'country', errors),
    isValidCountry(address.country, errors),
    validateRequired(address.postalCode, 'postalCode', errors),
  ];
  return !validations.some((x) => x == false);
}

function isValidCountry(country: string, errors: SectionError[]): boolean {
  if (!country) {
    return true;
  }
  const found = countriesList.includes(country);
  if (!found) {
    errors.push({
      field: 'country',
      message: 'value is not a valid country',
    });
    return false;
  }
  return true;
}

function validateRequired(
  val: string | boolean | null | undefined,
  name: string,
  errors: SectionError[],
): boolean {
  if (typeof val == 'boolean') {
    return val !== null && val !== undefined;
  }
  if (!val || val.trim() == '') {
    errors.push({
      field: name,
      message: `field ${name} is required`,
    });
    return false;
  }
  return true;
}
