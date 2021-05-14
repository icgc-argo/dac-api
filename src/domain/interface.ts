export type State =  'DRAFT' | 'READY TO SUBMIT' | 'REVIEW' | 'REVISION REQUESTED' | 'APPROVED' | 'RENEWING' | 'REJECTED' | 'CLOSED' | 'EXPIRED';

interface Meta {
  status: string;
  errors: {
    field: string;
    message: string;
  }[];
}

interface RevisionRequest {
  details: string;
  requested: boolean;
}

interface AgreementItem {
  name: string;
  accepted: boolean;
}

interface PersonalInfo {
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

interface Address {
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


export interface Application {
  appId: string;
  appNumber: number;
  state: State;
  submitterId: string;
  submitterEmail: string;
  signedAppDocObjId: string;
  submittedAtUtc: Date;
  approvedAtUtc: Date;
  expiresAtUtc: Date;
  closedAtUtc: Date;
  closedBy: string;
  denialReason: string;
  lastUpdatedAtDate: string;
  expiresAtDate: string;
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
      abstract: string;
      laySummary: string;
      pubMedIDs: string[]
    },
    ethicsLetter: {
      meta: Meta,
      declaredAsRequired: boolean | undefined;
      approvalLetterObjId: string | undefined;
      doesExpire: boolean
      expiryDateUtc: Date | undefined;
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
    }
  };
  updates: ApplicationUpdate[];
}
