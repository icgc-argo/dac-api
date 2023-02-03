import { Request } from 'express';

import { Identity } from '@overture-stack/ego-token-middleware';

export type State =
  | 'DRAFT'
  | 'SIGN AND SUBMIT'
  | 'REVIEW'
  | 'REVISIONS REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CLOSED'
  | 'EXPIRED'
  | 'PAUSED';

export type SectionStatus =
  | 'PRISTINE'
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'REVISIONS REQUESTED'
  | 'LOCKED'
  | 'DISABLED'
  | 'REVISIONS REQUESTED DISABLED'
  | 'REVISIONS MADE'
  | 'AMMENDABLE';

export type UploadDocumentType = 'ETHICS' | 'SIGNED_APP' | 'APPROVED_PDF';

export enum PauseReason {
  PENDING_ATTESTATION = 'PENDING ATTESTATION',
  ADMIN_PAUSE = 'ADMIN PAUSE',
}

export interface Meta {
  updated?: boolean;
  status: SectionStatus;
  errorsList: SectionError[];
  lastUpdatedAtUtc?: Date;
}

export interface RevisionRequest {
  details: string;
  requested: boolean;
}

export interface AgreementItem {
  name: string;
  accepted: boolean;
}

export interface PersonalInfo {
  title: string;
  firstName: string;
  middleName: string;
  lastName: string;
  displayName: string;
  suffix: string;
  primaryAffiliation: string;
  institutionEmail: string;
  googleEmail: string;
  website: string;
  positionTitle: string;
}

export interface Address {
  country: string;
  building: string;
  streetAddress: string;
  cityAndProvince: string;
  postalCode: string;
}

export interface Collaborator {
  meta: Meta;
  id?: string;
  info: PersonalInfo;
  type: 'student' | 'personnel';
}

export type CollaboratorDto = {
  info: Partial<PersonalInfo>;
  type: 'student' | 'personnel';
};

export enum DacoRole {
  SUBMITTER = 'SUBMITTER',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

export type UpdateAuthor = {
  id: string;
  role: DacoRole;
};

export enum AppType {
  NEW = 'NEW',
  RENEWAL = 'RENEWAL',
}

// to differentiate update events from app State
export enum UpdateEvent {
  CREATED = 'CREATED',
  SUBMITTED = 'SUBMITTED',
  PAUSED = 'PAUSED',
  REVISIONS_REQUESTED = 'REVISIONS REQUESTED',
  ATTESTED = 'ATTESTED',
  APPROVED = 'APPROVED',
  EXPIRED = 'EXPIRED',
  REJECTED = 'REJECTED',
  CLOSED = 'CLOSED',
}

interface ApplicationInfo {
  appType: AppType;
  institution: string;
  country: string;
  applicant: string;
  projectTitle: string;
  ethicsLetterRequired: boolean | null;
}

export interface ApplicationUpdate {
  author: UpdateAuthor;
  eventType: UpdateEvent;
  date: Date;
  daysElapsed: number;
  applicationInfo: ApplicationInfo;
}

export interface UserViewApplicationUpdate {
  author: Partial<UpdateAuthor>;
  eventType: UpdateEvent;
  date: Date;
  applicationInfo: Partial<ApplicationInfo>;
}

export interface SearchResult {
  pagingInfo: {
    totalCount: number;
    pagesCount: number;
    index: number;
  };
  items: ApplicationSummary[];
  stats:
    | undefined
    | {
        countByState: {
          [k in State]: number;
        };
      };
}

export interface ApplicationSummary {
  appId: string;
  state: State;
  submitterId: string;
  submittedAtUtc: Date;
  approvedAtUtc: Date;
  expiresAtUtc: Date;
  lastUpdatedAtUtc: Date;
  createdAtUtc: Date;
  closedAtUtc: Date;
  closedBy: string;
  ethics: {
    declaredAsRequired: boolean | undefined;
  };
  applicant: {
    info: PersonalInfo;
    address: Address;
  };
  collaborators?: PersonalInfo[];
  revisionsRequested: boolean;
  currentApprovedAppDoc: boolean;
  isRenewal: boolean;
  attestationByUtc?: Date;
  attestedAtUtc?: Date | null;
  isAttestable: boolean;
  ableToRenew: boolean;
  lastPausedAtUtc?: Date;
  sourceAppId?: string | null;
  renewalAppId?: string | null;
  renewalPeriodEndDateUtc?: Date;
}

export type ApplicationDto = Omit<Application, 'searchField'>;

export type SectionError = {
  field: string;
  message: string;
  code?: string;
};

type ApprovedAppDocument = {
  approvedAppDocObjId: string;
  uploadedAtUtc?: Date;
  approvedAppDocName: string;
  isCurrent: boolean;
  approvedAtUtc: Date;
};

export interface Sections {
  applicant: {
    meta: Meta;
    info: PersonalInfo;
    address: Address;
  };
  representative: {
    meta: Meta;
    info: PersonalInfo;
    addressSameAsApplicant: boolean;
    address: Address | undefined;
  };
  collaborators: {
    meta: Meta;
    list: Collaborator[];
  };
  projectInfo: {
    meta: Meta;
    title: string;
    website: string;
    background: string;
    aims: string;
    summary: string;
    methodology: string;
    publicationsURLs: string[];
  };
  ethicsLetter: {
    meta: Meta;
    declaredAsRequired: boolean | null;
    approvalLetterDocs: {
      objectId: string;
      uploadedAtUtc: Date;
      name: string;
    }[];
  };
  dataAccessAgreement: {
    meta: Meta;
    agreements: AgreementItem[];
  };
  appendices: {
    meta: Meta;
    agreements: AgreementItem[];
  };
  signature: {
    meta: Meta;
    signedAppDocObjId: string;
    uploadedAtUtc?: Date;
    signedDocName: string;
  };
}

export interface Application {
  appId: string;
  appNumber: number;
  state: State;
  submitterId: string;
  submitterEmail: string;
  submittedAtUtc: Date;
  approvedAtUtc: Date;
  expiresAtUtc: Date;
  closedAtUtc: Date;
  closedBy: string;
  denialReason: string;
  lastUpdatedAtUtc?: Date;
  createdAtUtc?: Date;
  searchValues: string[];
  isRenewal: boolean;
  ableToRenew: boolean; // calculated
  // calculated flag to indicate that revisions are being requested if any of the revisionRequest sections is true
  // and this flag will be reset before each review since we do reset the revision request portion.
  revisionsRequested: boolean;
  revisionRequest: {
    applicant: RevisionRequest;
    representative: RevisionRequest;
    projectInfo: RevisionRequest;
    collaborators: RevisionRequest;
    signature: RevisionRequest;
    ethicsLetter: RevisionRequest;
    general: RevisionRequest;
  };
  sections: Sections;
  updates: ApplicationUpdate[] | UserViewApplicationUpdate[];
  approvedAppDocs: ApprovedAppDocument[];
  attestationByUtc?: Date; // calculated from approvedAtUtc
  attestedAtUtc?: Date | null;
  isAttestable: boolean; // calculated
  pauseReason?: PauseReason | null;
  lastPausedAtUtc?: Date; // calculated
  emailNotifications?: NotificationSentFlags;
  sourceAppId?: string | null; // appId of original application, added to a renewal application
  renewalAppId?: string | null; // appId of renewal application, added to the original application
  renewalPeriodEndDateUtc?: Date; // source app expiresAtUtc + daysPostExpiry
}

export type AppSections = keyof Application['sections'];
export type RevisionSections =
  | keyof Pick<
      Record<AppSections, RevisionRequest>,
      | 'signature'
      | 'projectInfo'
      | 'applicant'
      | 'representative'
      | 'collaborators'
      | 'ethicsLetter'
    >
  | 'general';
export type RevisionRequestUpdate = Partial<Record<RevisionSections, RevisionRequest>>;

export interface NotificationSentFlags {
  attestationRequiredNotificationSent?: Date;
  applicationPausedNotificationSent?: Date;
  firstExpiryNotificationSent?: Date;
  secondExpiryNotificationSent?: Date;
  applicationExpiredNotificationSent?: Date;
  applicationClosedNotificationSent?: Date;
}

export interface UpdateApplication {
  state?: State;
  expiresAtUtc?: Date;
  denialReason?: string;
  revisionRequest?: RevisionRequestUpdate;
  pauseReason?: PauseReason;
  isAttesting?: boolean;
  sections: {
    applicant?: {
      info?: Partial<PersonalInfo>;
      address?: Partial<Address>;
    };
    representative?: {
      info?: Partial<PersonalInfo>;
      addressSameAsApplicant?: boolean;
      address?: Partial<Address>;
    };
    collaborators?: {
      list: Collaborator[];
    };
    projectInfo?: {
      title?: string;
      website?: string;
      background?: string;
      aims?: string;
      methodology?: string;
      summary?: string;
      publicationsURLs?: string[];
    };
    ethicsLetter?: {
      declaredAsRequired?: boolean | null;
      approvalLetterDocs?: {
        name: string;
        objectId: string;
        uploadedAtUtc: Date;
      }[];
    };
    dataAccessAgreement?: {
      agreements: AgreementItem[];
    };
    appendices?: {
      agreements: AgreementItem[];
    };
    signature?: {
      signedAppDocObjId: string;
    };
  };
}

export interface SubmitterInfo {
  userId: string;
  email: string;
}

export enum FileFormat {
  DACO_FILE_FORMAT = 'daco-file-format',
}

export type ColumnHeader = {
  accessor?: string;
  name: string;
  format?: (value: any) => any;
};

export interface IRequest extends Request {
  identity: Identity;
}

export interface UserDataFromApprovedApplicationsResult {
  applicant: Sections['applicant'];
  collaborators: Sections['collaborators'];
  lastUpdatedAtUtc?: Date;
  appId: string;
}

export interface ApprovedUserRowData {
  userName: string;
  openId: string;
  email: string;
  affiliation: string;
  changed: string;
}

// agreements constants
export const IT_AGREEMENT_SOFTWARE_UPDATES = 'it_agreement_software_updates';
export const IT_AGREEMENT_PROTECT_DATA = 'it_agreement_protect_data';
export const IT_AGREEMENT_MONITOR_ACCESS = 'it_agreement_monitor_access';
export const IT_AGREEMENT_DESTROY_COPIES = 'it_agreement_destroy_copies';
export const IT_AGREEMENT_ONBOARD_TRAINING = 'it_agreement_onboard_training';
export const IT_AGREEMENT_PROVIDE_INSTITUTIONAL_POLICIES =
  'it_agreement_provide_institutional_policies';
export const IT_AGREEMENT_CONTACT_DACO_FRAUD = 'it_agreement_contact_daco_fraud';
export const IT_AGREEMENT_CLOUD_USAGE_RISK = 'it_agreement_cloud_usage_risk';
export const IT_AGREEMENT_READ_CLOUD_APPENDIX = 'it_agreement_read_cloud_appendix';

export const APPENDIX_ICGC_GOALS_POLICIES = 'appendix_icgc_goals_policies';
export const APPENDIX_DATA_ACCESS_POLICY = 'appendix_data_access_policy';
export const APPENDIX_IP_POLICY = 'appendix_ip_policy';

export const DAA_CORRECT_APPLICATION_CONTENT = 'daa_correct_application_content';
export const DAA_AGREE_TO_TERMS = 'daa_agree_to_terms';
