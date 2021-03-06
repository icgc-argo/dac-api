import moment from 'moment';
import 'moment-timezone';
import { cloneDeep, last } from 'lodash';
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
  APPENDIX_ICGC_GOALS_POLICIES,
  APPENDIX_DATA_ACCESS_POLICY,
  APPENDIX_IP_POLICY,
  DAA_CORRECT_APPLICATION_CONTENT,
  DAA_AGREE_TO_TERMS,
  UpdateApplication,
  AgreementItem,
  Collaborator,
  State,
  SectionStatus,
  UploadDocumentType,
  RevisionRequestUpdate,
  CollaboratorDto,
  UpdateAuthor,
  AppType,
  ApplicationUpdate,
  UpdateEvent,
  UserViewApplicationUpdate,
  Meta,
  Sections,
  DacoRole,
} from './interface';
import { Identity } from '@overture-stack/ego-token-middleware';
import {
  validateAppendices,
  validateApplicantSection,
  validateCollaborator,
  validateDataAccessAgreement,
  validateDate,
  validateEthicsLetterSection,
  validateProjectInfo,
  validateRepresentativeSection,
} from './validations';
import { BadRequest, ConflictError, NotFound } from '../utils/errors';
import { AppConfig } from '../config';
import { getUpdateAuthor, mergeKnown } from '../utils/misc';
import { getAttestationByDate, getDaysElapsed, isAttestable } from '../utils/calculations';

const allSections: Array<keyof Application['sections']> = [
  'appendices',
  'dataAccessAgreement',
  'applicant',
  'collaborators',
  'ethicsLetter',
  'representative',
  'projectInfo',
  'signature',
];

/**
 * Array contains mapping that will govern which sections should be marked as locked
 * depending on which state we are and the role the viewer has.
 *
 * for example applicaions in review are completely locked for applicants but partially locked for admins.
 */
const stateToLockedSectionsMap: Record<
  State,
  Record<'REVIEWER' | 'APPLICANT', Array<keyof Application['sections']>>
> = {
  REVIEW: {
    APPLICANT: allSections,
    REVIEWER: allSections,
  },
  APPROVED: {
    APPLICANT: [
      'appendices',
      'dataAccessAgreement',
      'applicant',
      'representative',
      'projectInfo',
      'signature',
    ],
    REVIEWER: [
      'appendices',
      'dataAccessAgreement',
      'applicant',
      'representative',
      'projectInfo',
      'signature',
    ],
  },
  'REVISIONS REQUESTED': {
    APPLICANT: ['appendices', 'dataAccessAgreement'],
    REVIEWER: allSections,
  },
  'SIGN AND SUBMIT': {
    APPLICANT: [],
    REVIEWER: allSections,
  },
  CLOSED: {
    APPLICANT: allSections,
    REVIEWER: allSections,
  },
  DRAFT: {
    APPLICANT: [],
    REVIEWER: allSections,
  },
  EXPIRED: {
    APPLICANT: allSections,
    REVIEWER: allSections,
  },
  REJECTED: {
    APPLICANT: allSections,
    REVIEWER: allSections,
  },
  PAUSED: {
    APPLICANT: allSections,
    REVIEWER: allSections,
  },
};

export class ApplicationStateManager {
  public readonly currentApplication: Application;
  public readonly currentAppConfig: AppConfig;

  constructor(application: Application, config: AppConfig) {
    this.currentApplication = cloneDeep(application);
    this.currentAppConfig = cloneDeep(config);
  }

  prepareApplicationForUser(isReviewer: boolean) {
    allSections.forEach((s) => {
      this.currentApplication.sections[s].meta.status = calculateViewableSectionStatus(
        this.currentApplication,
        s,
        isReviewer,
      );
    });

    if (this.currentApplication.sections.representative.addressSameAsApplicant) {
      this.currentApplication.sections.representative.address = undefined;
    }

    if (!isReviewer) {
      this.currentApplication.updates = this.currentApplication.updates.map(
        (update: UserViewApplicationUpdate) => ({
          applicationInfo: { appType: update.applicationInfo.appType },
          date: update.date,
          eventType: update.eventType,
          author: { role: update.author?.role },
        }),
      );
    }
    // calculate the value of revisions requested field for the FE to use it.
    this.currentApplication.revisionsRequested =
      this.currentApplication.state == 'REVISIONS REQUESTED' ||
      wasInRevisionRequestState(this.currentApplication);

    if (this.currentApplication.approvedAtUtc) {
      this.currentApplication.attestationByUtc = getAttestationByDate(
        this.currentApplication.approvedAtUtc,
        this.currentAppConfig,
      );
    }
    // add isAttestable so FE doesn't need to do the calculation
    this.currentApplication.isAttestable = isAttestable(
      this.currentApplication,
      this.currentAppConfig,
    );
    return this.currentApplication;
  }

  deleteDocument(
    objectId: string,
    type: UploadDocumentType,
    updatedBy: string,
    isReviewer: boolean,
  ) {
    const current = this.currentApplication;
    if (isReviewer && current.state !== 'APPROVED') {
      throw new Error('not allowed');
    }
    if (type == 'ETHICS') {
      return deleteEthicsLetterDocument(current, objectId, getUpdateAuthor(updatedBy, isReviewer));
    }

    if (type == 'SIGNED_APP' && current.state == 'SIGN AND SUBMIT') {
      resetSignedDocument(current);
      current.sections.signature.meta.status = 'INCOMPLETE';
      return current;
    }

    if (type === 'APPROVED_PDF' && isReviewer && current.state === 'APPROVED') {
      deleteApprovedAppDocument(current, objectId);
      return current;
    }
    throw new BadRequest('Operation not allowed');
  }

  addDocument(
    id: string,
    name: string,
    type: UploadDocumentType,
    updatedBy: string,
    isReviewer: boolean,
  ) {
    const current = this.currentApplication;
    if (isReviewer && current.state !== 'APPROVED') {
      throw new Error('not allowed');
    }

    if (type == 'ETHICS') {
      uploadEthicsLetter(
        current,
        id,
        name,
        getUpdateAuthor(updatedBy, isReviewer),
        this.currentAppConfig,
      );
      return current;
    }

    if (type == 'SIGNED_APP') {
      if (current.state == 'SIGN AND SUBMIT') {
        current.sections.signature.signedAppDocObjId = id;
        current.sections.signature.uploadedAtUtc = new Date();
        current.sections.signature.signedDocName = name;
        current.sections.signature.meta.status = 'COMPLETE';
        updateSectionLastUpdatedAt(current, 'signature');
        return current;
      }
      throw new BadRequest('Cannot upload signed application in this state');
    }

    if (type === 'APPROVED_PDF') {
      if (current.state === 'APPROVED' && isReviewer) {
        const currentApprovedDoc = current.approvedAppDocs.find((doc) => doc.isCurrent);
        if (currentApprovedDoc) {
          // if there is an existing approved doc marked isCurrent: true, we remove it and replace with latest upload
          // this is just a simpler version of updating an doc in the array
          current.approvedAppDocs = current.approvedAppDocs.filter((doc) => !doc.isCurrent);
          // if the currentApprovedDoc approval date does not match the app level approval date, we assume it is no longer the most recent approved doc
          // this is just a safeguard, as the renewal process should reset any current approved doc to isCurrent: false
          if (currentApprovedDoc.approvedAtUtc.getTime() !== current.approvedAtUtc.getTime()) {
            currentApprovedDoc.isCurrent = false;
            current.approvedAppDocs.push(currentApprovedDoc);
          }
        }
        // Add the new uploaded doc to the approved doc list, and mark it as isCurrent: true + app's approvedAtUtc date
        // this covers:
        // a) there is no existing approved doc, so we are just adding it
        // b) there is an existing current approved doc, but the approval date does not match, so the existing doc is demoted and
        // the new upload becomes the current doc
        // c) there is an existing current approved doc with the same approval date, and we are just replacing it (this assumes the
        // admin is uploading a new version)
        current.approvedAppDocs.push({
          approvedAppDocObjId: id,
          uploadedAtUtc: new Date(),
          approvedAppDocName: name,
          isCurrent: true,
          approvedAtUtc: current.approvedAtUtc,
        });

        return current;
      }
      throw new Error('Not allowed');
    }
    throw new BadRequest('Unknown file type');
  }

  deleteCollaborator(collaboratorId: string, updatedBy: string, isReviewer: boolean) {
    const current = this.currentApplication;
    if (isReviewer && current.state !== 'APPROVED') {
      throw new Error('not allowed');
    }
    current.sections.collaborators.list = current.sections.collaborators.list.filter(
      (c) => c.id?.toString() !== collaboratorId,
    );
    current.sections.collaborators.meta.status = current.sections.collaborators.list.some(
      (c) => c.meta.status != 'COMPLETE',
    )
      ? 'INCOMPLETE'
      : 'COMPLETE';

    if (current.state == 'SIGN AND SUBMIT') {
      resetSignedDocument(current);
    } else if (current.state == 'REVISIONS REQUESTED') {
      updateAppStateForReturnedApplication(current, {}, getUpdateAuthor(updatedBy, isReviewer));
    } else if (current.state == 'DRAFT') {
      // This is to handle the scenario where changing the primary affiliation in applicant section in an application that is in the state 'SIGN & SUBMIT'
      // will invalidate the collaborators section
      // after fixing the collaborator PA the application should go back to SIGN & SUBMIT and not remain stuck in DRAFT. see test case: 'collaborator - (4) in state.spec.ts'
      transitionToSignAndSubmitOrRollBack(current, 'PRISTINE', 'DISABLED', 'DRAFT');
    }
    updateSectionLastUpdatedAt(current, 'collaborators');
    onAppUpdate(current);
    return current;
  }

  updateCollaborator(collaborator: Collaborator, updatedBy: UpdateAuthor) {
    const current = this.currentApplication;
    // collaborators updating is only allowed in these three states
    if (!canUpdateCollaborators(current)) {
      throw new Error('cannot update collaborators, only create or delete');
    }

    const { valid, errors } = validateCollaborator(collaborator, current);
    if (!valid) {
      throw new BadRequest({
        errors,
      });
    }
    const existing = current.sections.collaborators.list.find((c) => c.id == collaborator.id);
    if (!existing) {
      throw new NotFound('No collaborator with this id');
    }
    const updated = mergeKnown(existing, collaborator);
    if (!!updated.info.firstName.trim() && !!updated.info.lastName.trim()) {
      updated.info.displayName = updated.info.firstName.trim() + ' ' + updated.info.lastName.trim();
    }
    current.sections.collaborators.list = current.sections.collaborators.list.filter(
      (c) => c.id !== collaborator.id,
    );

    // before adding the collaborator check if any other collaborator has the same google email / institution email
    if (
      current.sections.collaborators.list.some(
        (c) =>
          c.info.googleEmail == collaborator.info.googleEmail ||
          c.info.institutionEmail === collaborator.info.institutionEmail,
      )
    ) {
      throw new ConflictError(
        'COLLABORATOR_EXISTS',
        'This collaborator has already been added to your application.',
      );
    }

    // check if the collaborator is same as applicant
    if (
      current.sections.applicant.info.googleEmail == collaborator.info.googleEmail ||
      current.sections.applicant.info.institutionEmail === collaborator.info.institutionEmail
    ) {
      throw new ConflictError(
        'COLLABORATOR_SAME_AS_APPLICANT',
        'The applicant does not need to be added as a collaborator.',
      );
    }

    updated.meta.status = 'COMPLETE';
    updated.meta.errorsList = [];
    current.sections.collaborators.list.push(updated);
    current.sections.collaborators.meta.updated = true;
    updateSectionLastUpdatedAt(current, 'collaborators');
    updateCollaboratorsSectionState(current);
    if (current.state == 'SIGN AND SUBMIT') {
      resetSignedDocument(current);
    } else if (current.state == 'REVISIONS REQUESTED') {
      updateAppStateForReturnedApplication(current, {}, updatedBy);
    } else if (current.state == 'DRAFT') {
      // This is to handle the scenario where changing the primary affiliation in applicant section in an application that is in the state 'SIGN & SUBMIT'
      // will invalidate the collaborators section
      // after fixing the collaborator PA the application should go back to SIGN & SUBMIT and not remain stuck in DRAFT. see test case: 'collaborator - (4) in state.spec.ts'
      transitionToSignAndSubmitOrRollBack(current, 'PRISTINE', 'DISABLED', 'DRAFT');
    }

    onAppUpdate(current);
    return current;
  }

  addCollaborator(collaborator: CollaboratorDto, updatedBy: string, isReviewer: boolean) {
    const current = this.currentApplication;
    if (isReviewer && current.state !== 'APPROVED') {
      throw new Error('not allowed');
    }
    const defaultCollaboratorInfo = {
      title: '',
      firstName: '',
      middleName: '',
      lastName: '',
      displayName: '',
      suffix: '',
      primaryAffiliation: '',
      institutionEmail: '',
      googleEmail: '',
      website: '',
      positionTitle: '',
    };

    // ensure optional fields have defaults
    const createdCollaborator = {
      ...collaborator,
      info: { ...defaultCollaboratorInfo, ...collaborator.info },
    } as Collaborator;

    const { valid, errors } = validateCollaborator(createdCollaborator, current);
    if (!valid) {
      throw new BadRequest({
        errors,
      });
    }

    if (shouldBeLockedByAtThisState(current.state, 'collaborators', false)) {
      throw new Error('Operation not allowed');
    }

    createdCollaborator.id = new Date().getTime().toString();
    createdCollaborator.meta = {
      errorsList: [],
      status: 'COMPLETE',
    };

    if (!!createdCollaborator.info.firstName.trim() && !!createdCollaborator.info.lastName.trim()) {
      createdCollaborator.info.displayName =
        createdCollaborator.info.firstName.trim() + ' ' + createdCollaborator.info.lastName.trim();
    }

    // check unique collaborator
    if (
      current.sections.collaborators.list.some(
        (c) =>
          c.info.googleEmail == createdCollaborator.info.googleEmail ||
          c.info.institutionEmail === createdCollaborator.info.institutionEmail,
      )
    ) {
      throw new ConflictError(
        'COLLABORATOR_EXISTS',
        'This collaborator has already been added to your application',
      );
    }

    // check if the collaborator is same as applicant
    if (
      current.sections.applicant.info.googleEmail == createdCollaborator.info.googleEmail ||
      current.sections.applicant.info.institutionEmail === createdCollaborator.info.institutionEmail
    ) {
      throw new ConflictError(
        'COLLABORATOR_SAME_AS_APPLICANT',
        'The applicant does not need to be added as a collaborator.',
      );
    }

    current.sections.collaborators.list.push(createdCollaborator);
    // since this section can be invalidated by primary affiliation change in applicant
    // we store this flag to indicate whether it was modified or not, so we can return it
    // to a correct state when it becomes valid again
    // example:
    // application is in REVISIONS REQUESTED and Collaborators.status = 'REVISIONS REQUESTED'
    // applicant modifies primary affiliation in Applicant section.
    // collaborators section becomes 'INCOMPLETE'
    // applicant reverts change of primary affiliation in applicant section
    // collaborators section goes back to REVISIONS REQUESTED if updated = false, and goes to REVISIONS MADE if updated = true
    // same logic applies for representative and any cross section dependency that may be implemented later.
    current.sections.collaborators.meta.updated = true;
    updateSectionLastUpdatedAt(current, 'collaborators');
    updateCollaboratorsSectionState(current);
    if (current.state == 'SIGN AND SUBMIT') {
      resetSignedDocument(current);
    } else if (current.state == 'REVISIONS REQUESTED') {
      // trigger transition in application state and sign and submit check
      updateAppStateForReturnedApplication(current, {}, getUpdateAuthor(updatedBy, isReviewer));
    }

    onAppUpdate(current);
    return current;
  }

  updateApp(updatePart: Partial<UpdateApplication>, isReviewer: boolean, updatedBy: UpdateAuthor) {
    const current = this.currentApplication;
    switch (this.currentApplication.state) {
      case 'APPROVED':
        updateAppStateForApprovedApplication(
          current,
          updatePart,
          isReviewer,
          updatedBy,
          this.currentAppConfig,
          false,
        );
        break;

      case 'REVISIONS REQUESTED':
        updateAppStateForReturnedApplication(current, updatePart, updatedBy);
        break;

      case 'REVIEW':
        // we are updating an application in review state (i.e. admin wants to a. approve, b. reject, c. request revisions)
        if (!isReviewer) {
          throw new Error('not allowed');
        }
        updateAppStateForReviewApplication(current, updatePart, updatedBy);
        break;

      case 'SIGN AND SUBMIT':
        updateAppStateForSignAndSubmit(current, updatePart, updatedBy);
        break;

      case 'DRAFT':
        updateAppStateForDraftApplication(current, updatePart, updatedBy);
        break;

      case 'PAUSED':
        updateAppStateForPausedApplication(current, updatePart, updatedBy, this.currentAppConfig);
        break;

      default:
        throw new Error(`Invalid app state: ${current.state}`);
    }

    // save / error
    onAppUpdate(current);
    return current;
  }
}

function canUpdateCollaborators(current: Application) {
  return (
    current.state == 'DRAFT' ||
    current.state == 'SIGN AND SUBMIT' ||
    (current.state == 'REVISIONS REQUESTED' && current.revisionRequest.collaborators.requested)
  );
}

function deleteEthicsLetterDocument(
  current: Application,
  objectId: string,
  updatedBy: UpdateAuthor,
) {
  if (!current.sections.ethicsLetter.declaredAsRequired) {
    throw new Error('Must declare ethics letter as required first');
  }

  if (!current.sections.ethicsLetter.approvalLetterDocs.some((x) => x.objectId == objectId)) {
    throw new Error('this id doesnt exist');
  }

  const updatePart: Partial<UpdateApplication> = {
    sections: {
      ethicsLetter: {
        // send the all the items without the deleted one
        approvalLetterDocs: current.sections.ethicsLetter.approvalLetterDocs.filter(
          (d) => d.objectId !== objectId,
        ),
      },
    },
  };

  if (current.state == 'DRAFT') {
    updateAppStateForDraftApplication(current, updatePart, updatedBy, true);
  } else if (current.state == 'REVISIONS REQUESTED') {
    updateAppStateForReturnedApplication(current, updatePart, updatedBy, true);
  } else if (current.state == 'SIGN AND SUBMIT') {
    updateAppStateForSignAndSubmit(current, updatePart, updatedBy, true);
  } else {
    throw new Error('Cannot delete ethics letter in this application state');
  }

  updateSectionLastUpdatedAt(current, 'ethicsLetter');
  onAppUpdate(current);
  return current;
}

export function getSearchFieldValues(appDoc: Application) {
  return [
    appDoc.appId,
    appDoc.state,
    appDoc.sections.ethicsLetter.declaredAsRequired ? 'yes' : 'no',
    // this will be ET to match admin location when they do search
    moment(appDoc.lastUpdatedAtUtc).tz('America/Toronto').format('YYYY-MM-DD'),
    appDoc.expiresAtUtc
      ? moment(appDoc.expiresAtUtc).tz('America/Toronto').format('YYYY-MM-DD')
      : '',
    appDoc.sections.applicant.info.displayName,
    appDoc.sections.applicant.info.googleEmail,
    appDoc.sections.applicant.info.primaryAffiliation,
    appDoc.sections.applicant.address.country,
    appDoc.isRenewal ? AppType.RENEWAL : AppType.NEW,
  ].filter((x) => !(x === null || x === undefined || x.trim() === ''));
}

export function newApplication(identity: Identity): Partial<Application> {
  const pristineMeta = {
    status: 'PRISTINE' as SectionStatus,
    errorsList: [],
  } as Meta;

  const app: Partial<Application> = {
    state: 'DRAFT',
    submitterId: identity.userId,
    submitterEmail: identity.tokenInfo.context.user.email,
    revisionRequest: emptyRevisionRequest(),
    sections: {
      collaborators: {
        meta: pristineMeta,
        list: [],
      },
      appendices: {
        meta: pristineMeta,
        agreements: getAppendixAgreements(),
      },
      dataAccessAgreement: {
        meta: pristineMeta,
        agreements: getDataAccessAgreement(),
      },
      applicant: {
        meta: pristineMeta,
        address: {
          building: '',
          cityAndProvince: '',
          country: '',
          postalCode: '',
          streetAddress: '',
        },
        info: {
          firstName: '',
          googleEmail: '',
          displayName: '',
          institutionEmail: '',
          website: '',
          lastName: '',
          middleName: '',
          positionTitle: '',
          primaryAffiliation: '',
          suffix: '',
          title: '',
        },
      },
      projectInfo: {
        background: '',
        methodology: '',
        aims: '',
        website: '',
        title: '',
        summary: '',
        publicationsURLs: [],
        meta: pristineMeta,
      },
      ethicsLetter: {
        // tslint:disable-next-line:no-null-keyword
        declaredAsRequired: null,
        approvalLetterDocs: [],
        meta: pristineMeta,
      },
      representative: {
        address: {
          building: '',
          cityAndProvince: '',
          country: '',
          postalCode: '',
          streetAddress: '',
        },
        addressSameAsApplicant: false,
        info: {
          firstName: '',
          googleEmail: '',
          institutionEmail: '',
          displayName: '',
          lastName: '',
          middleName: '',
          website: '',
          positionTitle: '',
          primaryAffiliation: '',
          suffix: '',
          title: '',
        },
        meta: pristineMeta,
      },
      signature: {
        meta: {
          status: 'DISABLED',
          errorsList: [],
        },
        signedAppDocObjId: '',
        signedDocName: '',
      },
    },
    updates: [],
    isRenewal: false,
    ableToRenew: false,
  };

  const author = getUpdateAuthor(identity.userId, false); // set to false as we already know user scopes have been checked
  const createdEvent = createUpdateEvent(app as Application, author, UpdateEvent.CREATED);
  app.updates?.push(createdEvent);

  return app;
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
      requested: false,
    },
  };
}

function uploadEthicsLetter(
  current: Application,
  id: string,
  name: string,
  updatedBy: UpdateAuthor,
  config: AppConfig,
) {
  if (!current.sections.ethicsLetter.declaredAsRequired) {
    throw new Error('Must declare ethics letter as required first');
  }

  const updatePart: Partial<UpdateApplication> = {
    sections: {
      ethicsLetter: {
        // we need to provide the existing items as well for the merge logic to work correctly and not delete array items
        approvalLetterDocs: current.sections.ethicsLetter.approvalLetterDocs
          // remove any current docs that have new docs name
          .filter((doc) => doc.name !== name)
          .concat([
            {
              name,
              objectId: id,
              uploadedAtUtc: new Date(),
            },
          ]),
      },
    },
  };

  if (current.state == 'DRAFT') {
    updateAppStateForDraftApplication(current, updatePart, updatedBy, true);
  } else if (current.state == 'REVISIONS REQUESTED') {
    updateAppStateForReturnedApplication(current, updatePart, updatedBy, true);
  } else if (current.state == 'APPROVED') {
    updateAppStateForApprovedApplication(current, updatePart, false, updatedBy, config, true);
  } else if (current.state == 'SIGN AND SUBMIT') {
    updateAppStateForSignAndSubmit(current, updatePart, updatedBy, true);
  } else {
    throw new Error('cannot update ethics letter at this state');
  }
  updateSectionLastUpdatedAt(current, 'ethicsLetter');
  onAppUpdate(current);

  return current;
}

function updateAppStateForReviewApplication(
  current: Application,
  updatePart: Partial<UpdateApplication>,
  updatedBy: UpdateAuthor,
) {
  // if the admin has chosen a custom expiry date and asked to save
  if (updatePart.expiresAtUtc) {
    // todo this needs validation
    current.expiresAtUtc = updatePart.expiresAtUtc;
  }

  // admin wants to approve the app
  if (updatePart.state == 'APPROVED') {
    return transitionToApproved(current, updatedBy);
  }

  if (updatePart.state == 'REJECTED') {
    return transitionToRejected(current, updatePart, updatedBy);
  }

  if (updatePart.state == 'REVISIONS REQUESTED') {
    return transitionToRevisionsRequested(current, updatePart, updatedBy);
  }

  if (updatePart.state === 'CLOSED') {
    throw new Error('Cannot close an application in REVIEW state.');
  }
}

function transitionToRevisionsRequested(
  current: Application,
  updatePart: Partial<UpdateApplication>,
  updateAuthor: UpdateAuthor,
) {
  if (updatePart.revisionRequest == undefined) {
    throw new BadRequest('you need to select at least one specific section');
  }

  validateRevisionRequest(updatePart.revisionRequest);

  // update the current state of revision request for the app with the incoming data
  current.revisionRequest = mergeKnown(current.revisionRequest, updatePart.revisionRequest);

  markSectionsForReview(current);

  // empty the signature (need to delete the document too.)
  resetSignedDocument(current);

  const sectionsWithRevisions = Object.keys(current.revisionRequest).filter(
    (section) => current.revisionRequest[section as keyof RevisionRequestUpdate].requested,
  );
  const revisionsOnSignatureSectionOnly =
    sectionsWithRevisions.length === 1 && sectionsWithRevisions[0] === 'signature';

  // put into SIGN AND SUBMIT state when just the signature section has revisions requested to allow user to upload a new signed doc
  current.state = revisionsOnSignatureSectionOnly ? 'SIGN AND SUBMIT' : 'REVISIONS REQUESTED';
  current.updates.push(createUpdateEvent(current, updateAuthor, UpdateEvent.REVISIONS_REQUESTED));
  return current;
}

function resetSignedDocument(current: Application) {
  // only update this date if there is an existing signed doc to reset.
  // prevents the update from happening before the signature section is touched
  if (current.sections.signature.signedAppDocObjId) {
    updateSectionLastUpdatedAt(current, 'signature');
  }
  current.sections.signature.signedAppDocObjId = '';
  current.sections.signature.uploadedAtUtc = undefined;
  current.sections.signature.signedDocName = '';
}

const createUpdateEvent: (
  app: Application,
  author: UpdateAuthor,
  updateEvent: UpdateEvent,
) => ApplicationUpdate = (app, author, updateEvent) => {
  // lastUpdatedUtc won't work for the purpose of the daysElapsed value, as it tracks ANY change to the app, not our specified event types
  // we are looking for the diff between this new update and whatever the last update event was
  const currentDate = moment.utc().toDate();
  // get most recent event
  const lastUpdateEvent = last(app.updates);
  // daysElapsed will be 0 if there is no previous update event
  let daysElapsed = 0;
  if (lastUpdateEvent) {
    daysElapsed = getDaysElapsed(currentDate, lastUpdateEvent.date);
  }

  // some values are recorded separately here (eg. projectTitle, country) since we want a snapshot of these at the time the event occurred
  return {
    date: currentDate,
    eventType: updateEvent,
    author,
    daysElapsed,
    applicationInfo: {
      appType: app.isRenewal ? AppType.RENEWAL : AppType.NEW,
      institution: app.sections.applicant.info.primaryAffiliation,
      country: app.sections.applicant.address.country,
      applicant: app.sections.applicant.info.displayName,
      projectTitle: app.sections.projectInfo.title,
      ethicsLetterRequired: app.sections.ethicsLetter.declaredAsRequired,
    },
  };
};

function deleteApprovedAppDocument(current: Application, objectId: string) {
  if (!current.approvedAppDocs.some((doc) => doc.approvedAppDocObjId === objectId)) {
    throw new Error(`This id doesn't exist`);
  }
  const updatedDocs = current.approvedAppDocs.filter((doc) => doc.approvedAppDocObjId !== objectId);
  current.approvedAppDocs = updatedDocs;
  return current;
}

function transitionToRejected(
  current: Application,
  updatePart: Partial<UpdateApplication>,
  rejectedBy: UpdateAuthor,
) {
  current.state = 'REJECTED';
  current.denialReason = updatePart.denialReason || '';
  current.updates.push(createUpdateEvent(current, rejectedBy, UpdateEvent.REJECTED));
  return current;
}

function transitionFromPausedToApproved(
  current: Application,
  updatedBy: UpdateAuthor,
  updatePart?: Partial<UpdateApplication>,
) {
  // this transition does not equal an APPROVED update event
  current.state = 'APPROVED';
  // reset pauseReason if no longer in PAUSED state
  // TODO: right now there is no other transition for a PAUSED app, but may need to revisit this for a possible PAUSED -> EXPIRED transition
  current.pauseReason = undefined;
  if (updatePart?.attestedAtUtc) {
    updateAttestedAtUtc(current, updatePart, updatedBy);
  }
  return current;
}

function transitionToApproved(current: Application, approvedBy: UpdateAuthor) {
  current.state = 'APPROVED';
  current.approvedAtUtc = new Date();
  current.updates.push(createUpdateEvent(current, approvedBy, UpdateEvent.APPROVED));
  // if there was no custom expiry date set already
  if (!current.expiresAtUtc) {
    current.expiresAtUtc = moment().add(2, 'year').toDate();
  }
  return current;
}

const transitionToClosed: (current: Application, closedBy: UpdateAuthor) => Application = (
  current,
  closedBy,
) => {
  current.state = 'CLOSED';
  current.closedBy = closedBy.id;
  const closedDate = moment().toDate();
  current.closedAtUtc = closedDate;
  current.updates.push(createUpdateEvent(current, closedBy, UpdateEvent.CLOSED));
  // if expiresAtUtc exists, set to date app was closed
  if (current.expiresAtUtc) {
    current.expiresAtUtc = closedDate;
  }
  return current;
};

const transitionToPaused: (
  current: Application,
  pausedBy: UpdateAuthor,
  reason?: string,
) => Application = (current, pausedBy, reason) => {
  current.state = 'PAUSED';
  if (reason) {
    current.pauseReason = reason;
  }
  current.updates.push(createUpdateEvent(current, pausedBy, UpdateEvent.PAUSED));
  return current;
};

function validateRevisionRequest(revisionRequest: RevisionRequestUpdate) {
  const atleastOneRequested = Object.keys(revisionRequest)
    .map((k) => k as keyof RevisionRequestUpdate)
    .filter((k) => k != 'general')
    .some((k) => revisionRequest[k]?.requested);

  if (!atleastOneRequested) {
    throw new BadRequest('At least one specific section should be requested for revision');
  }

  return true;
}

function markSectionsForReview(current: Application) {
  const atleastOneNonSignatureRequested = Object.keys(current.revisionRequest)
    .map((k) => k as keyof RevisionRequestUpdate)
    .filter((k) => k != 'general' && k != 'signature')
    .some((k) => current.revisionRequest[k]?.requested);

  Object.keys(current.revisionRequest)
    .map((k) => k as keyof RevisionRequestUpdate)
    .filter((k) => k != 'general' && k != 'signature')
    .filter((k) => current.revisionRequest[k]?.requested)
    .forEach((k) => {
      type sectionNames = keyof Application['sections'] & keyof Application['revisionRequest'];
      current.sections[k as sectionNames].meta.status = 'REVISIONS REQUESTED';
    });

  // special handling for the signature section since it should be done last thing
  // and we want to disable it until other sections are updated.
  if (current.revisionRequest.signature.requested) {
    current.sections.signature.meta.status = atleastOneNonSignatureRequested
      ? 'REVISIONS REQUESTED DISABLED'
      : 'REVISIONS REQUESTED';
  } else {
    current.sections.signature.meta.status = 'DISABLED';
  }
}

function updateAppStateForSignAndSubmit(
  current: Application,
  updatePart: Partial<UpdateApplication>,
  updatedBy: UpdateAuthor,
  updateDocs?: boolean,
) {
  if (updatePart.state === 'CLOSED') {
    return transitionToClosed(current, updatedBy);
  }
  // applicant wants to submit the app
  if (updatePart.state == 'REVIEW') {
    const ready = isReadyForReview(current);
    if (ready) {
      current.state = 'REVIEW';
      current.submittedAtUtc = new Date();
      // reset revision request section
      current.revisionRequest = emptyRevisionRequest();
      current.updates.push(createUpdateEvent(current, updatedBy, UpdateEvent.SUBMITTED));
      resetSectionUpdatedFlag(current);
    }
    return current;
  }

  if (!updatePart.sections) {
    throw new Error();
  }

  // applicant went back and updated completed sections (we treat that as an update in draft state)
  if (wasInRevisionRequestState(current)) {
    updateAppStateForReturnedApplication(current, updatePart, updatedBy, updateDocs);
  } else {
    updateAppStateForDraftApplication(current, updatePart, updatedBy, updateDocs);
  }

  return current;
}

function resetSectionUpdatedFlag(current: Application) {
  Object.keys(current.sections).forEach((s: string) => {
    delete current.sections[s as keyof Application['sections']].meta.updated;
  });
}

export function wasInRevisionRequestState(app: Application) {
  const revisionsRequested = Object.keys(app.revisionRequest)
    .map((k) => k as keyof Application['revisionRequest'])
    .filter((k) => k !== 'general')
    .some((k) => {
      return app.revisionRequest[k].requested;
    });

  return revisionsRequested;
}

function isReadyForReview(application: Application) {
  return application.sections.signature.meta.status === 'COMPLETE';
}

function updateAppStateForApprovedApplication(
  currentApplication: Application,
  updatePart: Partial<UpdateApplication>,
  isReviewer: boolean,
  updatedBy: UpdateAuthor,
  config: AppConfig,
  updateDocs?: boolean,
) {
  if (updatePart.state === 'CLOSED') {
    return transitionToClosed(currentApplication, updatedBy);
  }
  if (updatePart.state === 'PAUSED') {
    // right now only SYSTEM role will be able to pause applications
    // admin pause configurable for testing
    if (
      updatedBy.role !== DacoRole.SYSTEM &&
      !(isReviewer && updatePart.pauseReason === 'ADMIN-PAUSE')
    ) {
      throw new Error('Not allowed');
    }
    return transitionToPaused(currentApplication, updatedBy, updatePart.pauseReason);
  }

  if (updatePart.attestedAtUtc) {
    if (!isAttestable(currentApplication, config)) {
      throw new Error('Application is not attestable');
    }
    if (updatedBy.role !== DacoRole.SUBMITTER) {
      throw new Error('Not allowed');
    }
    return updateAttestedAtUtc(currentApplication, updatePart, updatedBy);
  }
  if (currentApplication.sections.ethicsLetter.declaredAsRequired && updateDocs) {
    delete updatePart.sections?.ethicsLetter?.declaredAsRequired;
    updateEthics(updatePart, currentApplication, updateDocs);
  }
}

function updateAttestedAtUtc(
  currentApplication: Application,
  updatePart: Partial<UpdateApplication>,
  updatedBy: UpdateAuthor,
) {
  // TODO: change request body from ui so date validation is not needed, i.e. {attesting: true} or similar
  validateDate(updatePart.attestedAtUtc?.toString());
  currentApplication.attestedAtUtc = new Date();
  currentApplication.updates.push(
    createUpdateEvent(currentApplication, updatedBy, UpdateEvent.ATTESTED),
  );
  return currentApplication;
}

function updateAppStateForPausedApplication(
  currentApplication: Application,
  updatePart: Partial<UpdateApplication>,
  updatedBy: UpdateAuthor,
  config: AppConfig,
  updateDocs?: boolean,
) {
  if (updatePart.state === 'APPROVED') {
    // Submitters cannot directly APPROVE a PAUSED application, only transition via attestation
    if (updatedBy.role === DacoRole.SUBMITTER) {
      throw new Error('Not allowed');
    }
    return transitionFromPausedToApproved(currentApplication, updatedBy);
  }

  // can only attest if it is the configured # of days to attestationByUtc date or later
  if (updatePart.attestedAtUtc && isAttestable(currentApplication, config)) {
    // only submitters can attest
    if (updatedBy.role === DacoRole.SUBMITTER) {
      return transitionFromPausedToApproved(currentApplication, updatedBy, updatePart);
    }
  }
}

function updateAppStateForReturnedApplication(
  current: Application,
  updatePart: Partial<UpdateApplication>,
  updatedBy: UpdateAuthor,
  updateDocs?: boolean,
) {
  if (updatePart.state === 'CLOSED') {
    return transitionToClosed(current, updatedBy);
  }
  if (current.revisionRequest.applicant.requested) {
    updateApplicantSection(updatePart, current);
  }
  // if the representative section became incomplete when there is no rev requested (happens because of Primary affiliation)
  if (
    current.revisionRequest.representative.requested ||
    current.sections.representative.meta.status == 'INCOMPLETE'
  ) {
    updateRepresentative(updatePart, current);
  }
  if (current.revisionRequest.projectInfo.requested) {
    updateProjectInfo(updatePart, current);
  }
  if (current.revisionRequest.ethicsLetter.requested) {
    updateEthics(updatePart, current, updateDocs);
  }

  const signatureSectionStatus = current.revisionRequest.signature.requested
    ? 'REVISIONS REQUESTED'
    : 'PRISTINE';

  const rollBackSignatureStatus = current.revisionRequest.signature.requested
    ? 'REVISIONS REQUESTED DISABLED'
    : 'DISABLED';

  transitionToSignAndSubmitOrRollBack(
    current,
    signatureSectionStatus,
    rollBackSignatureStatus,
    'REVISIONS REQUESTED',
  );
}

function updateAppStateForDraftApplication(
  current: Application,
  updatePart: Partial<UpdateApplication>,
  updatedBy: UpdateAuthor,
  updateDocs?: boolean,
) {
  if (updatePart.state === 'CLOSED') {
    return transitionToClosed(current, updatedBy);
  }
  updateApplicantSection(updatePart, current);
  updateRepresentative(updatePart, current);
  updateProjectInfo(updatePart, current);
  updateEthics(updatePart, current, updateDocs);
  updateDataAccessAgreements(updatePart, current);
  updateAppendices(updatePart, current);

  // check if it's ready to move to the next state [DRAFT => SIGN & SUBMIT]
  // OR should move back to draft from SIGN & SUBMIT
  transitionToSignAndSubmitOrRollBack(current, 'PRISTINE', 'DISABLED', 'DRAFT');
}

function transitionToSignAndSubmitOrRollBack(
  current: Application,
  signatureSectionStateAfter: SectionStatus,
  rollBackSignatureStatus: SectionStatus,
  rollbackStatus: State,
) {
  const isReady = isReadyToSignAndSubmit(current);
  if (isReady) {
    toSignAndSubmit(current, signatureSectionStateAfter);
  } else {
    current.sections.signature.meta.status = rollBackSignatureStatus;
    current.state = rollbackStatus;
  }
  resetSignedDocument(current);
}

function toSignAndSubmit(current: Application, signatureSectionState: SectionStatus) {
  // if all sections are ready and collaborator is not, then since it's optional
  // we mark it as complete as discussed on slack.
  if (current.sections.collaborators.meta.status == 'PRISTINE') {
    current.sections.collaborators.meta.status = 'COMPLETE';
  }
  current.sections.signature.meta.status = signatureSectionState;
  current.state = 'SIGN AND SUBMIT';
}

function updateSectionLastUpdatedAt(app: Application, sectionName: keyof Sections) {
  app.sections[sectionName].meta.lastUpdatedAtUtc = new Date();
  return app;
}

function updateAppendices(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.appendices?.agreements) {
    mergeAgreementArray(
      current.sections.appendices.agreements,
      updatePart.sections.appendices.agreements,
    );
    updateSectionLastUpdatedAt(current, 'appendices');
    validateAppendices(current);
  }
}

function updateDataAccessAgreements(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.dataAccessAgreement?.agreements) {
    mergeAgreementArray(
      current.sections.dataAccessAgreement.agreements,
      updatePart.sections.dataAccessAgreement.agreements,
    );
    updateSectionLastUpdatedAt(current, 'dataAccessAgreement');
    validateDataAccessAgreement(current);
  }
}

function updateEthics(
  updatePart: Partial<UpdateApplication>,
  current: Application,
  updateDocs?: boolean,
) {
  if (updatePart.sections?.ethicsLetter) {
    // prevent update of the documents from here
    if (!updateDocs) {
      delete updatePart.sections.ethicsLetter.approvalLetterDocs;
    }
    current.sections.ethicsLetter = mergeKnown(
      current.sections.ethicsLetter,
      updatePart.sections.ethicsLetter,
    );

    // if the applicant switched the answer from yes to no, we no longer keep
    if (!current.sections.ethicsLetter.declaredAsRequired) {
      current.sections.ethicsLetter.approvalLetterDocs = [];
    }
    updateSectionLastUpdatedAt(current, 'ethicsLetter');
    validateEthicsLetterSection(current);
  }
}

function updateProjectInfo(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.projectInfo) {
    current.sections.projectInfo = mergeKnown(
      current.sections.projectInfo,
      updatePart.sections.projectInfo,
    );
    updateSectionLastUpdatedAt(current, 'projectInfo');
    validateProjectInfo(current);
  }
}

function updateRepresentative(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.representative) {
    // we don't want to update address from representative if we are using same applicant address
    // this is an edge case if there is an API misuse
    if (
      updatePart.sections.representative.addressSameAsApplicant === true ||
      (current.sections.representative.addressSameAsApplicant === true &&
        updatePart.sections.representative.addressSameAsApplicant !== false)
    ) {
      updatePart.sections.representative.address = {
        building: '',
        cityAndProvince: '',
        country: '',
        postalCode: '',
        streetAddress: '',
      };
    }

    current.sections.representative = mergeKnown(
      current.sections.representative,
      updatePart.sections.representative,
    );
    const info = current.sections.representative.info;
    if (!!info.firstName.trim() && !!info.lastName.trim()) {
      current.sections.representative.info.displayName =
        info.firstName.trim() + ' ' + info.lastName.trim();
    }
    const currentState = current.sections.representative.meta.status;
    current.sections.representative.meta.updated = true;
    updateSectionLastUpdatedAt(current, 'representative');
    updateRepresentativeSectionState(current);
  }
}

function updateRepresentativeSectionState(app: Application) {
  const { isValid, errors } = validateRepresentativeSection(app);
  app.sections.representative.meta.errorsList = errors;
  const revRequested = app.revisionRequest.representative.requested;
  const wasUpdated = app.sections.representative.meta.updated;
  const newState: SectionStatus = transitionSectionState(wasUpdated, isValid, revRequested);
  app.sections.representative.meta.status = newState;
}

function transitionSectionState(
  wasUpdated: boolean | undefined,
  isValid: boolean,
  revRequested: boolean,
) {
  let newState: SectionStatus;
  if (wasUpdated) {
    newState = isValid ? 'COMPLETE' : 'INCOMPLETE';
  } else {
    if (revRequested) {
      newState = isValid ? 'REVISIONS REQUESTED' : 'INCOMPLETE';
    } else {
      newState = isValid ? 'COMPLETE' : 'INCOMPLETE';
    }
  }
  return newState;
}

function updateCollaboratorsSectionState(app: Application) {
  const isValid = !app.sections.collaborators.list.some((c) => c.meta.status != 'COMPLETE');
  const newState: SectionStatus = transitionSectionState(
    app.sections.collaborators.meta.updated,
    isValid,
    app.revisionRequest.collaborators.requested,
  );
  app.sections.collaborators.meta.status = newState;
}

function updateApplicantSection(updatePart: Partial<UpdateApplication>, current: Application) {
  if (updatePart.sections?.applicant) {
    current.sections.applicant = mergeKnown(
      current.sections.applicant,
      updatePart.sections.applicant,
    );
    const info = current.sections.applicant.info;
    if (!!info.firstName.trim() && !!info.lastName.trim()) {
      current.sections.applicant.info.displayName =
        info.firstName.trim() + ' ' + info.lastName.trim();
    }
    updateSectionLastUpdatedAt(current, 'applicant');
    validateApplicantSection(current);

    // trigger a validation for representative section since there is a dependency on primary affiliation
    // only if there is data there already
    if (current.sections.representative.meta.status !== 'PRISTINE') {
      updateRepresentativeSectionState(current);
    }

    // trigger a validation for collaborators section since there is a dependency on primary affiliation, institutionEmail and googleEmail
    // only if there is data there already
    if (current.sections.collaborators.meta.status !== 'PRISTINE') {
      validateCollaboratorsSection(current);
      updateCollaboratorsSectionState(current);
    }
  }
}

function validateCollaboratorsSection(app: Application) {
  const validations = app.sections.collaborators.list.map((c) => {
    const { valid, errors } = validateCollaborator(c, app, true);
    // will treat conflicting collab/applicant error differently when the update is to applicant, update
    // will succeed for applicant but related collaborator will be set with an error + incomplete state
    if (valid) {
      c.meta.status = 'COMPLETE';
      c.meta.errorsList = [];
      return true;
    }
    c.meta.status = 'INCOMPLETE';
    c.meta.errorsList = errors;
    return false;
  });

  // if any collaborator is invalid mark the section as incomplete
  if (validations.some((x) => x == false)) {
    app.sections.collaborators.meta.status = 'INCOMPLETE';
  }
}

function mergeAgreementArray(current: AgreementItem[], update: AgreementItem[]) {
  update.forEach((ai) => {
    const name = ai.name;
    const target = current.find((a) => a.name == name);
    if (!target) return;
    target.accepted = ai.accepted;
  });
}

function isReadyToSignAndSubmit(app: Application) {
  const sections = app.sections;
  const requiredSectionsComplete =
    sections.applicant.meta.status == 'COMPLETE' &&
    sections.representative.meta.status == 'COMPLETE' &&
    sections.projectInfo.meta.status == 'COMPLETE' &&
    sections.ethicsLetter.meta.status == 'COMPLETE' &&
    sections.dataAccessAgreement.meta.status == 'COMPLETE' &&
    sections.appendices.meta.status == 'COMPLETE' &&
    // only check that collaborators section is not incomplete or not in revisions requested (which can happen)
    sections.collaborators.meta.status !== 'INCOMPLETE' &&
    sections.collaborators.meta.status !== 'REVISIONS REQUESTED';

  return requiredSectionsComplete;
}

function getAppendixAgreements() {
  return [
    {
      name: APPENDIX_ICGC_GOALS_POLICIES,
      accepted: false,
    },
    {
      name: APPENDIX_DATA_ACCESS_POLICY,
      accepted: false,
    },
    {
      name: APPENDIX_IP_POLICY,
      accepted: false,
    },
  ];
}

function getDataAccessAgreement() {
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
      name: DAA_CORRECT_APPLICATION_CONTENT,
      accepted: false,
    },
    {
      name: DAA_AGREE_TO_TERMS,
      accepted: false,
    },
  ];
}

function calculateViewableSectionStatus(
  app: Application,
  section: keyof Application['sections'],
  isReviewer: boolean,
): SectionStatus {
  const reviewableSections: Array<keyof RevisionRequestUpdate> = [
    'applicant',
    'collaborators',
    'ethicsLetter',
    'projectInfo',
    'signature',
    'representative',
  ];
  const reviewableSection = reviewableSections.includes(section as keyof RevisionRequestUpdate);

  if (
    shouldBeLockedByAtThisState(app.state, section, isReviewer) ||
    (!reviewableSection && wasInRevisionRequestState(app))
  ) {
    return 'LOCKED';
  }
  // an extra logic is needed for sections that are usually editable but no revisions required
  // for them in a returned application Or they have revisions
  else if (
    reviewableSection &&
    (app.state == 'REVISIONS REQUESTED' || wasInRevisionRequestState(app)) &&
    !isReviewer
  ) {
    // mark sections that don't have revision requests as locked
    // for example if applicant section is OK we lock it.
    // an edge case is if the applicant changes primary affiliation of applicant and the
    // representative/collaborators now become invalid although they were complete
    // in that case we unlock them and mark as incomplete (decision on slack)
    if (
      section !== 'signature' &&
      app.revisionRequest[section as keyof RevisionRequestUpdate].requested !== true &&
      app.sections[section].meta.status == 'COMPLETE'
    ) {
      return 'LOCKED';
    }

    // mark sections that have revision requests and now completed with custom status to
    // show they were updated after the revision request
    if (
      app.revisionRequest[section as keyof RevisionRequestUpdate].requested === true &&
      app.sections[section].meta.status == 'COMPLETE'
    ) {
      return 'REVISIONS MADE';
    }
  }
  // for collaborators and ethics letters section, applicants may keep adding letters, and add/remove collaborators
  // even after approval, we need to indicate that using a section state 'AMMENDABLE'
  else if (app.state == 'APPROVED' && ['ethicsLetter', 'collaborators'].includes(section)) {
    if (section == 'ethicsLetter') {
      return app.sections.ethicsLetter.declaredAsRequired ? 'AMMENDABLE' : 'LOCKED';
    }
    if (section == 'collaborators') {
      return 'AMMENDABLE';
    }
  }

  // none of the above return the section status as is
  return app.sections[section].meta.status;
}

function shouldBeLockedByAtThisState(
  state: State,
  section: keyof Application['sections'],
  isReviewer: boolean,
) {
  return stateToLockedSectionsMap[state][isReviewer ? 'REVIEWER' : 'APPLICANT'].includes(section);
}

function onAppUpdate(current: Application) {
  current.lastUpdatedAtUtc = new Date();
  current.searchValues = getSearchFieldValues(current);
}
