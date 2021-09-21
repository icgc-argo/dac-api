export type State =
  | 'DRAFT'
  | 'SIGN AND SUBMIT'
  | 'REVIEW'
  | 'REVISIONS REQUESTED'
  | 'APPROVED'
  | 'RENEWING'
  | 'REJECTED'
  | 'CLOSED'
  | 'EXPIRED';

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

export type UploadDocumentType = 'ETHICS' | 'SIGNED_APP';
interface Meta {
  updated?: boolean;
  status: SectionStatus;
  errorsList: SectionError[];
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

interface ApplicationUpdate {
  info: any;
  type: string;
  date: Date;
}

export interface SearchResult {
  pagingInfo: {
    totalCount: number;
    pagesCount: number;
    index: number;
  };
  items: ApplicationSummary[];
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
  };
  collaborators?: PersonalInfo[];
}

export type ApplicationDto = Omit<Application, 'searchField'>;

export type SectionError = {
  field: string;
  message: string;
  code?: string;
};
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
  sections: {
    terms: {
      meta: Meta;
      agreement: AgreementItem;
    };
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
  };
  // this is intended for human auditing and wouldn't recommend using this for any application logic
  // unless it's revised to fit the case.
  updates: ApplicationUpdate[];
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
export interface UpdateApplication {
  state?: State;
  expiresAtUtc?: Date;
  denialReason?: string;
  revisionRequest?: RevisionRequestUpdate;
  sections: {
    terms?: {
      agreement: AgreementItem;
    };
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

export enum FileFormat {
  DACO_FILE_FORMAT = 'daco-file-format',
}

export type CSVFileHeader = {
  accessor?: string;
  name: string;
};

export const TERMS_AGREEMENT_NAME = 'introduction_agree_to_terms';
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
