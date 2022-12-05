import { expect } from 'chai';
import * as config from '../config';
import sinon from 'sinon';
import { Identity } from '@overture-stack/ego-token-middleware';

import { isApplicationJwt, isUserJwt } from '../utils/permissions';

const mockConfig = {
  serverPort: '3000',
  basePath: '/',
  openApiPath: '/api-docs',
  logLevel: 'debug',
  mongoProperties: {
    writeConcern: 'majority',
    writeAckTimeout: 5000,
  },
  kafkaProperties: {
    kafkaBrokers: [],
    kafkaClientId: '',
    kafkaMessagingEnabled: false,
  },
  auth: {
    enabled: true,
    jwtKeyUrl: '',
    jwtKey: '',
    reviewScope: 'TEST-ADMIN-SCOPE.WRITE',
    dacoSystemScope: 'TEST-SYSTEM-SCOPE.WRITE',
  },
  ui: {
    baseUrl: '',
    sectionPath: '/applications/{id}?section={section}',
  },
  storage: {
    endpoint: '',
    region: 'nova',
    bucket: 'obviously incorrect bucket name',
    timeout: 5000,
  },
  email: {
    host: 'localhost',
    port: 1025,
    dacoAddress: 'daco@example.com',
    fromName: process.env.EMAIL_FROM_NAME || 'ICGC DACO',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'no-reply-daco@example.com',
    dccMailingList: process.env.DCC_MAILING_LIST || 'dcc@example.com',
    links: {
      dataAccessGuide: '',
      reviewGuide: '',
      applyingForAccess: '',
      revisionsRequestedGuide: '',
      approvalGuide: '',
      dacoSurvey: '',
      accessRenewalGuide: '',
      attestationGuide: '',
      generalApplicationGuide: '',
    },
    reviewerFirstName: process.env.EMAIL_REVIEWER_FIRSTNAME || 'DACO',
    reviewerLastName: process.env.EMAIL_REVIEWER_LASTNAME || 'administrator',
  },
  durations: {
    expiry: {
      daysToExpiry1: 90,
      daysToExpiry2: 45,
      daysPostExpiry: 90,
      count: 2,
      unitOfTime: 'years',
    },
    attestation: {
      count: 1,
      unitOfTime: 'years',
      daysToAttestation: 45,
    },
  },
  adminPause: false,
};

export const mockedConfig = sinon.replace(config, 'getAppConfig', sinon.fake.returns(mockConfig));
const testConfig = mockedConfig();

/* test jwt data */
export const mockApplicantScope = 'TEST-USER.READ';

const mockApplicantJwtData = {
  sub: '1234',
  iat: 123,
  exp: 456,
  iss: 'ego',
  jti: 'jti123',
  aud: [],
  context: {
    scope: [mockApplicantScope],
    user: {
      email: 'applicant@example.com',
      status: 'APPROVED',
      firstName: 'Applicant',
      lastName: 'User',
      createdAt: 1580931064975,
      lastLogin: 1669299843399,
      preferredLanguage: '',
      providerType: 'GOOGLE',
      providerSubjectId: '123',
      type: 'ADMIN',
      groups: [],
    },
  },
};

const mockAdminJwtData = {
  sub: 'admin1234',
  iat: 123,
  exp: 456,
  iss: 'ego',
  jti: 'jti123',
  aud: [],
  context: {
    scope: [mockedConfig().auth.reviewScope],
    user: {
      email: 'applicant@example.com',
      status: 'APPROVED',
      firstName: 'Applicant',
      lastName: 'User',
      createdAt: 1580931064975,
      lastLogin: 1669299843399,
      preferredLanguage: '',
      providerType: 'GOOGLE',
      providerSubjectId: '123',
      type: 'ADMIN',
      groups: [],
    },
  },
};

const mockSystemJwtData = {
  sub: 'system008b',
  exp: 1670087158,
  iat: 1669223158,
  jti: '144358jhf7owob22',
  nbf: 1669223158,
  scope: [mockedConfig().auth.dacoSystemScope],
  iss: 'ego',
  context: {
    scope: [mockedConfig().auth.dacoSystemScope],
    application: {
      name: '',
      clientId: '',
      redirectUri: '',
      status: 'APPROVED',
      errorRedirectUri: '',
      type: 'CLIENT',
    },
  },
};

/* test tokens */
export const mockApplicantToken = {
  userId: mockApplicantJwtData.sub,
  tokenInfo: mockApplicantJwtData,
} as Identity;

export const mockAdminToken = {
  userId: mockAdminJwtData.sub,
  tokenInfo: mockAdminJwtData,
} as Identity;

export const mockSystemToken = {
  userId: mockSystemJwtData.sub,
  tokenInfo: mockSystemJwtData,
} as Identity;

describe('mock config', () => {
  it('should load mock config', () => {
    expect(testConfig.email.dacoAddress).to.eq('daco@example.com');
    expect(testConfig.storage.bucket).to.eq('obviously incorrect bucket name');
  });
});

describe('mock tokens', () => {
  it('the mocked applicant token should be a UserIdentity', () => {
    expect(isUserJwt(mockApplicantToken)).to.be.true;
    expect(isApplicationJwt(mockApplicantToken)).to.be.false;
  });

  it('the mocked admin token should be a UserIdentity', () => {
    expect(isUserJwt(mockAdminToken)).to.be.true;
    expect(isApplicationJwt(mockAdminToken)).to.be.false;
  });

  it('the mocked system token should be an ApplicationIdentity', () => {
    expect(isApplicationJwt(mockSystemToken)).to.be.true;
    expect(isUserJwt(mockSystemToken)).to.be.false;
  });
});
