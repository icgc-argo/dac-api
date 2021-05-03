type State =  'DRAFT' |  'READY_TO_SUBMIT' | 'IN_REVIEW' | 'REVISION_NEEDED' | 'APPROVED' | 'REOPENED' | 'REJECTED' |'CLOSED' | 'EXPIRED';

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
    pageSize: number,
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
  closedAtUtc: Date;
  closedBy: string;
  applicant: {
    info: PersonalInfo,
  };
}


export interface Application {
  appId: string;
  state: State;
  submitterId: string;
  signedAppDocObjId: string;
  submittedAtUtc: Date;
  approvedAtUtc: Date;
  expiresAtUtc: Date;
  closedAtUtc: Date;
  closedBy: string;
  denialReason: string;
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
