export type State =  'DRAFT' | 'SIGN AND SUBMIT' | 'REVIEW' | 'REVISIONS REQUESTED' | 'APPROVED' | 'RENEWING' | 'REJECTED' | 'CLOSED' | 'EXPIRED';

export type SectionStatus = 'PRISTINE' | 'COMPLETE' | 'INCOMPLETE' | 'LOCKED' | 'DISABLED';
interface Meta {
  status: SectionStatus;
  errorsList: SectionError[];
}
interface RevisionRequest {
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
  institutionWebsite: string;
  positionTitle: string;
}

export interface Address {
  country: string;
  building: string;
  streetAddress: string;
  cityAndProvince: string;
  postalCode: string;
}

interface Collaborator {
  meta: Meta;
  info: PersonalInfo;
  type: string;
}

interface ApplicationUpdate {
  details: string;
  type: string;
  date: Date;
}

export interface SearchResult {
  pagingInfo: {
    totalCount: number,
    pagesCount: number,
    index: number,
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
    info: PersonalInfo,
  };
}


export type ApplicationDto = Omit<Application, 'searchField'>;

export type SectionError = { field: string, message: string };
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
  revisionRequest: {
    applicant: RevisionRequest,
    representative: RevisionRequest,
    projectInfo: RevisionRequest,
    collaborators: RevisionRequest,
    signature: RevisionRequest,
    general: RevisionRequest
  };
  sections: {
    terms: {
      meta: Meta,
      agreement: AgreementItem
    },
    applicant: {
      meta: Meta,
      info: PersonalInfo,
      address: Address
    },
    representative: {
      meta: Meta,
      info: PersonalInfo,
      addressSameAsApplicant: boolean;
      address: Address
    },
    collaborators: {
      meta: Meta,
      list: Collaborator[],
    },
    projectInfo: {
      meta: Meta,
      title: string;
      website: string;
      background: string;
      aims: string;
      methodology: string;
      publicationsURLs: string[]
    },
    ethicsLetter: {
      meta: Meta,
      declaredAsRequired: boolean | null;
      approvalLetterDocs: {
        objectId: string;
        uploadedAtUtc: Date
      }[];
    },
    ITAgreements: {
      meta: Meta,
      agreements: AgreementItem[],
    },
    dataAccessAgreement: {
      meta: Meta,
      agreements: AgreementItem[],
    },
    appendices: {
      meta: Meta,
      agreements: AgreementItem[],
    },
    signature: {
      meta: Meta,
      signedAppDocObjId: string;
    }
  };
  updates: ApplicationUpdate[];
}


