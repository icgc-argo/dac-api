import { mergeKnown } from '../utils/misc';
import moment from 'moment';
import 'moment-timezone';
import _ from 'lodash';
import {
  Application,
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
  DAA_AGREE_TO_TERMS, UpdateApplication,
  AgreementItem, Collaborator, State,
  SectionStatus, UploadDocumentType
} from './interface';
import { Identity } from '@overture-stack/ego-token-middleware';
import {
  validateAppendices,
  validateApplicantSection,
  validateCollaborator,
  validateCollaboratorsSection,
  validateDataAccessAgreement,
  validateEthicsLetterSection,
  validateITAgreement,
  validateProjectInfo,
  validateRepresentativeSection
} from './validations';
import { BadRequest, NotFound } from '../utils/errors';

export class ApplicationStateManager {

  private readonly currentApplication: Application;

  constructor(application: Application) {
    this.currentApplication = _.cloneDeep(application);
  }

  deleteDocument(objectId: string, type: UploadDocumentType) {
    const current = _.cloneDeep(this.currentApplication) as Application;
    if (type == 'ETHICS') {
      if (!current.sections.ethicsLetter.declaredAsRequired) {
        throw new Error('Must decalre ethics letter as requried first');
      }

      if (!current.sections.ethicsLetter.approvalLetterDocs.some(x => x.objectId == objectId)) {
        throw new Error('this id doesnt exist');
      }

      const updatePart: Partial<UpdateApplication> = {
        sections: {
          ethicsLetter: {
            // send the all the items without the deleted one
            approvalLetterDocs: current.sections.ethicsLetter.approvalLetterDocs.filter(d => d.objectId !== objectId),
          }
        }
      };

      if (current.state == 'DRAFT') {
        return updateAppStateForDraftApplication(current, updatePart, true);
      } else if (current.state == 'REVISIONS REQUESTED'
        && current.sections.ethicsLetter.meta.status == 'REVISIONS REQUESTED') {
        return updateAppStateForRetrunedApplication(current, updatePart, true);
      }  else {
        throw new Error('Cannot delete ethics letter in this application state');
      }
      return current;
    }

    if (type == 'SIGNED_APP') {
      if (current.state == 'SIGN AND SUBMIT'
        && current.sections.signature.signedAppDocObjId == objectId) {
        current.sections.signature.signedAppDocObjId = '';
        current.sections.signature.signedAtUtc = undefined;
        current.sections.signature.signedDocName = '';
        current.sections.signature.meta.status = 'INCOMPLETE';
        return current;
      }
      throw new Error('Cannot upload signed application in this state');
    }
    throw new Error('Unknown file type');
  }

  addDocument(id: string, name: string, type: UploadDocumentType) {
    const current = _.cloneDeep(this.currentApplication) as Application;
    if (type == 'ETHICS') {
      if (!current.sections.ethicsLetter.declaredAsRequired) {
        throw new Error('Must decalre ethics letter as requried first');
      }
      const updatePart: Partial<UpdateApplication> = {
        sections: {
          ethicsLetter: {
            // we need to provide the existing items as well for the merge logic to work correctly and not delete array items
            approvalLetterDocs: current.sections.ethicsLetter.approvalLetterDocs.concat([{
              name,
              objectId: id,
              uploadedAtUtc: new Date(),
            }]),
          }
        }
      };

      if (current.state == 'DRAFT') {
        return updateAppStateForDraftApplication(current, updatePart, true);
      } else if (current.state == 'REVISIONS REQUESTED') {
        return updateAppStateForRetrunedApplication(current, updatePart, true);
      } else if (current.state == 'APPROVED') {
        return updateAppStateForApprovedApplication(current, updatePart, false);
      }
      return current;
    }

    if (type == 'SIGNED_APP') {
      if (current.state == 'SIGN AND SUBMIT') {
        current.sections.signature.signedAppDocObjId = id;
        current.sections.signature.signedAtUtc = new Date();
        current.sections.signature.signedDocName = name;
        current.sections.signature.meta.status = 'COMPLETE';
        return current;
      }
      throw new Error('Cannot upload signed application in this state');
    }
    throw new Error('Unknown file type');
  }

  deleteCollaborator(collaboratorId: string) {
    const current = _.cloneDeep(this.currentApplication) as Application;
    current.sections.collaborators.list = current.sections.collaborators.list.filter(c => c.id?.toString() !== collaboratorId);
    current.sections.collaborators.meta.status =
      current.sections.collaborators.list.some(c => c.meta.status != 'COMPLETE') ?  'INCOMPLETE' : 'COMPLETE';
    return current;
  }

  updateCollaborator(collaborator: Collaborator) {
    const current = _.cloneDeep(this.currentApplication) as Application;
    if (current.state != 'DRAFT'
        && current.state != 'REVISIONS REQUESTED') {
      throw new Error('cannot update collaborators, only create or delete');
    }
    const { valid, errors } = validateCollaborator(collaborator, current);
    if (!valid) {
      throw new BadRequest({
        errors
      });
    }
    const existing = current.sections.collaborators.list.find(c => c.id == collaborator.id);
    if (!existing) {
      throw new NotFound('No collaborator with this id');
    }
    const updated = mergeKnown(existing, collaborator);
    current.sections.collaborators.list = current.sections.collaborators.list.filter(c => c.id !== collaborator.id);
    current.sections.collaborators.list.push(updated);
    current.sections.collaborators.meta.status =
      current.sections.collaborators.list.some(c => c.meta.status != 'COMPLETE') ?  'INCOMPLETE' : 'COMPLETE';
    return current;
  }

  addCollaborator(collaborator: Collaborator) {
    const current = _.cloneDeep(this.currentApplication) as Application;
    const { valid, errors } = validateCollaborator(collaborator, current);
    if (!valid) {
      throw new BadRequest({
        errors,
      });
    }

    collaborator.id = new Date().getTime().toString();
    collaborator.meta = {
      errorsList: [],
      status: 'COMPLETE'
    };
    current.sections.collaborators.list.push(collaborator);
    current.sections.collaborators.meta.status =
      current.sections.collaborators.list.some(c => c.meta.status != 'COMPLETE') ?  'INCOMPLETE' : 'COMPLETE';
    return current;
  }

  updateApp(updatePart: Partial<UpdateApplication>, isReviewer: boolean) {
    let merged: Application | undefined = undefined;

    switch (this.currentApplication.state) {
      case 'APPROVED':
        merged = updateAppStateForApprovedApplication(this.currentApplication, updatePart, isReviewer);
        break;
      case 'REVISIONS REQUESTED':
        merged = updateAppStateForRetrunedApplication(this.currentApplication, updatePart);
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
    markSectionsForReview(current);
    return current;
  }
}

function markSectionsForReview(current: Application) {
  let otherSectionsRequested = false;
  if (current.revisionRequest.applicant.requested) {
    otherSectionsRequested = true;
    current.sections.applicant.meta.status = 'REVISIONS REQUESTED';
  }
  if (current.revisionRequest.collaborators.requested) {
    otherSectionsRequested = true;
    current.sections.collaborators.meta.status = 'REVISIONS REQUESTED';
  }
  if (current.revisionRequest.ethicsLetter.requested) {
    otherSectionsRequested = true;
    current.sections.ethicsLetter.meta.status = 'REVISIONS REQUESTED';
  }
  if (current.revisionRequest.projectInfo.requested) {
    otherSectionsRequested = true;
    current.sections.projectInfo.meta.status = 'REVISIONS REQUESTED';
  }
  if (current.revisionRequest.representative.requested) {
    otherSectionsRequested = true;
    current.sections.representative.meta.status = 'REVISIONS REQUESTED';
  }
  if (current.revisionRequest.signature.requested) {
    if (otherSectionsRequested) {
      current.sections.signature.meta.status = 'DISABLED REVISIONS REQUESTED';
    } else {
      current.sections.signature.meta.status = 'REVISIONS REQUESTED';
    }
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

  if (!updatePart.sections) {
    throw new Error();
  }

  // applicant went back and updated completed sections (we treat that as an update in draft state)
  const updated = updateAppStateForDraftApplication(current, updatePart);
  return updated;
}


function isReadyForReview(application: Application) {
  return application.sections.signature.meta.status === 'COMPLETE';
}

// TODO handle possible changes after approval (close)
function updateAppStateForApprovedApplication(currentApplication: Application,
  updatePart: Partial<UpdateApplication>,
  isReviewer: boolean) {
  const current = _.cloneDeep(currentApplication);
  return current;
}

function updateAppStateForRetrunedApplication(currentApplication: Application,
  updatePart: Partial<UpdateApplication>,
  updateDocs?: boolean) {
  const current = _.cloneDeep(currentApplication);
  updateApplicantSection(updatePart, current);
  updateRepresentative(updatePart, current);
  updateProjectInfo(updatePart, current);
  updateEthics(updatePart, current, updateDocs);

  const signatureSectionStatus = currentApplication.revisionRequest.signature.requested ?
    'REVISIONS REQUESTED' : 'PRISTINE';

  const rollBackSignatureStatus = currentApplication.revisionRequest.signature.requested ?
    'DISABLED REVISIONS REQUESTED' : 'DISABLED';

  transitionToSignAndSubmitOrRollBack(current, signatureSectionStatus, rollBackSignatureStatus, 'REVISIONS REQUESTED');
  return current;
}

function updateAppStateForDraftApplication(currentApplication: Application,
   updatePart: Partial<UpdateApplication>,
   updateDocs?: boolean) {
  const current = _.cloneDeep(currentApplication);
  updateTerms(updatePart, current);
  updateApplicantSection(updatePart, current);
  updateRepresentative(updatePart, current);
  updateProjectInfo(updatePart, current);
  updateEthics(updatePart, current, updateDocs);
  updateITAgreements(updatePart, current);
  updateDataAccessAgreements(updatePart, current);
  updateAppendices(updatePart, current);

  // check if it's ready to move to the next state [DRAFT => SIGN & SUBMIT] OR should move back to draft from SIGN & SUBMIT
  transitionToSignAndSubmitOrRollBack(current, 'PRISTINE', 'DISABLED', 'DRAFT');

  return current;
}


function transitionToSignAndSubmitOrRollBack(current: Application, signatureSectionStateAfter: SectionStatus, rollBackSignatureStatus: SectionStatus, rollbackStatus: State) {
  const isReady = isReadyToSignAndSubmit(current);
  if (isReady) {
    toSignAndSubmit(current, signatureSectionStateAfter);
  } else {
    current.sections.signature.meta.status = rollBackSignatureStatus;
    current.state = rollbackStatus;
  }
}

function toSignAndSubmit(app: Application, signatureSectionState: SectionStatus) {
  // if all sections are ready and collaborator is not, then since it's optional
 // we mark it as complete as discussed on slack.
 if (app.sections.collaborators.meta.status == 'PRISTINE') {
   app.sections.collaborators.meta.status = 'COMPLETE';
 }
 app.sections.signature.meta.status = signatureSectionState;
 app.state = 'SIGN AND SUBMIT';
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

function updateEthics(updatePart: Partial<UpdateApplication>, current: Application, updateDocs?: boolean) {
  if (updatePart.sections?.ethicsLetter) {
    // prevent update of the documents from here
    if (!updateDocs) {
      delete updatePart.sections.ethicsLetter.approvalLetterDocs;
    }
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
    current.sections.representative = mergeKnown(current.sections.representative, updatePart.sections.representative);
    const info = current.sections.representative.info;
    if (!!info.firstName.trim() && !!info.lastName.trim()) {
      current.sections.representative.info.displayName = info.firstName.trim() + ' ' + info.lastName.trim();
    }
    validateRepresentativeSection(current);
  }
}

function updateApplicantSection(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.applicant) {
    current.sections.applicant = mergeKnown(current.sections.applicant, updatePart.sections.applicant);
    const info = current.sections.applicant.info;
    if (!!info.firstName.trim() && !!info.lastName.trim()) {
      current.sections.applicant.info.displayName = info.firstName.trim() + ' ' + info.lastName.trim();
    }
    validateApplicantSection(current);

    // trigger a validation for representative section since there is a dependency on primary affiliation
    // only if there is data there already
    if (current.sections.representative.meta.status !== 'PRISTINE' ) {
      validateRepresentativeSection(current);
    }

    // trigger a validation for collaborators section since there is a dependency on primary affiliation
    // only if there is data there already
    if (current.sections.collaborators.meta.status !== 'PRISTINE' ) {
      validateCollaboratorsSection(current);
    }
  }
}

function mergeAgreementArray(current: AgreementItem[], update: AgreementItem[]) {
  update.forEach(ai => {
    const name = ai.name;
    const target = current.find(a => a.name == name);
    if (!target) return;
    target.accepted = ai.accepted;
  });
}

export function getSearchFieldValues(appDoc: Application) {
  return [
    appDoc.appId,
    appDoc.state,
    appDoc.sections.ethicsLetter.declaredAsRequired ? 'yes' : 'no',
    // this will be ET to match admin location when they do search
    moment(appDoc.lastUpdatedAtUtc).tz('America/Toronto').format('YYYY-MM-DD'),
    appDoc.expiresAtUtc ? moment(appDoc.expiresAtUtc).tz('America/Toronto').format('YYYY-MM-DD') : '',
    appDoc.sections.applicant.info.displayName,
    appDoc.sections.applicant.info.googleEmail,
    appDoc.sections.applicant.info.primaryAffiliation,
  ].filter(x => !(x === null || x === undefined || x.trim() === ''));
}

function isReadyToSignAndSubmit(app: Application) {
  const sections = app.sections;
  const requiredSectionsComplete = sections.terms.meta.status == 'COMPLETE'
    && sections.applicant.meta.status == 'COMPLETE'
    && sections.representative.meta.status == 'COMPLETE'
    && sections.projectInfo.meta.status == 'COMPLETE'
    && sections.ethicsLetter.meta.status == 'COMPLETE'
    && sections.ITAgreements.meta.status == 'COMPLETE'
    && sections.dataAccessAgreement.meta.status == 'COMPLETE'
    && sections.appendices.meta.status == 'COMPLETE'
    // only check that collaborators section is not incomplete (which can happend)
    && sections.collaborators.meta.status !== 'INCOMPLETE';
  return requiredSectionsComplete;
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
        signedDocName: ''
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