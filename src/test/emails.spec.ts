import renderSubmitted from '../emails/submitted';
import renderNewReview from '../emails/review-new';
import renderRevisionsEmail from '../emails/revisions-requested';
import renderApprovedEmail from '../emails/application-approved';
import renderCollaboratorNotificationEmail from '../emails/collaborator-notification';
import renderCollaboratorRemovedEmail from '../emails/collaborator-removed';
import renderClosedEmail from '../emails/closed-approved';
import rejected from '../emails/rejected';
import renderAccessExpiringEmail from '../emails/access-expiring';
import renderAccessHasExpiredEmail from '../emails/access-has-expired';
import renderAttestationRequiredEmail from '../emails/attestation-required';
import renderApplicationPausedEmail from '../emails/application-paused';
import renderAttestationReceivedEmail from '../emails/attestation-received';

import {
  getAppInReview,
  getAppInRevisionRequested,
  getApprovedApplication,
  getPausedApplication,
  getRejectedApplication,
} from './state.spec';
import { Collaborator } from '../domain/interface';
import { AppConfig } from '../config';

const stub = {
  dataAccessGuide: '',
  reviewGuide: '',
  applyingForAccess: '',
  revisionsRequestedGuide: '',
  approvalGuide: '',
  dacoSurvey: '',
  accessRenewalGuide: '',
  attestationGuide: '',
  generalApplicationGuide: '',
};

const durationsStub = {
  expiry: {
    daysToExpiry1: 90,
    daysToExpiry2: 45,
    daysPostExpiry: 90,
    count: 2,
    unitOfTime: 'years',
  },
  attestation: {
    count: 1,
    unitOfTime: 'year',
    daysToAttestation: 45,
  },
} as AppConfig['durations'];

const uiLinksStub = {
  baseUrl: 'http://daco.icgc-argo.org',
  pathTemplate: '/applications/{id}?section={section}',
};

describe('emails', () => {
  describe('email rendering', () => {
    it('should render submission email', async () => {
      const app = getAppInReview();
      const email = await renderSubmitted(app, {
        applyingForAccess: '',
        approvalGuide: '',
        dataAccessGuide: '',
        reviewGuide: 'https://test.example.com',
        revisionsRequestedGuide: '',
        dacoSurvey: '',
        accessRenewalGuide: '',
        attestationGuide: '',
        generalApplicationGuide: '',
      });
      console.log(email.emailMjml);
    });

    it('should render reviewer email', async () => {
      const app = getAppInReview();
      const email = await renderNewReview(
        app,
        { lastName: 'Dough', firstName: 'Pizza' },
        uiLinksStub,
      );
      console.log(email.emailMjml);
    });

    it('should render revisions requested email', async () => {
      const app = getAppInRevisionRequested();
      const email = await renderRevisionsEmail(app, {
        email: {
          links: {
            applyingForAccess: 'https://www.google.com',
            reviewGuide: '',
            revisionsRequestedGuide: 'https://www.google.ca',
          },
        },
        ui: uiLinksStub,
      } as any);
      console.log(email.emailMjml);
    });

    it('should render approved email', async () => {
      const app = getApprovedApplication();
      const email = await renderApprovedEmail(app, stub);
      console.log(email.emailMjml);
    });

    it('should render collaborator notification email', async () => {
      const app = getApprovedApplication();
      const collab: Collaborator = {
        meta: {
          errorsList: [],
          status: 'COMPLETE',
          lastUpdatedAtUtc: new Date(),
        },
        info: {
          firstName: 'Bashar',
          lastName: 'Allabadi',
          googleEmail: 'bashar@example.com',
          primaryAffiliation: 'OICR',
          institutionEmail: 'adsa@example.com',
          middleName: '',
          positionTitle: 'Manager',
          suffix: '',
          title: '',
          displayName: '',
          website: '',
        },
        type: 'personnel',
      };
      const email = await renderCollaboratorNotificationEmail(app, collab, {
        ...stub,
        dataAccessGuide: 'https://www.google.com',
      });
      console.log(email.emailMjml);
    });

    it('should render a collaborator removed notification email', async () => {
      const app = getApprovedApplication();
      const collab: Collaborator = {
        meta: {
          errorsList: [],
          status: 'COMPLETE',
          lastUpdatedAtUtc: new Date(),
        },
        info: {
          firstName: 'Bashar',
          lastName: 'Allabadi',
          googleEmail: 'bashar@example.com',
          primaryAffiliation: 'OICR',
          institutionEmail: 'adsa@example.com',
          middleName: '',
          positionTitle: 'Manager',
          suffix: '',
          title: '',
          displayName: '',
          website: '',
        },
        type: 'personnel',
      };

      const email = await renderCollaboratorRemovedEmail(app, collab, {
        ...stub,
      });
      console.log(email.emailMjml);
    });

    it('should render approved application closed email', async () => {
      const app = getApprovedApplication();
      const email = await renderClosedEmail(app, stub);
      console.log(email.emailMjml);
    });

    it('should render rejected email', async () => {
      const app = getRejectedApplication();
      const email = await rejected(app, stub);
      console.log(email.emailMjml);
    });

    it('should render an access expiring in 45 days email', async () => {
      const app = getApprovedApplication();
      const email = await renderAccessExpiringEmail(app, stub, uiLinksStub, durationsStub, 45);
      console.log(email.emailMjml);
    });

    it('should render an access expiring in 90 days email', async () => {
      const app = getApprovedApplication();
      const email = await renderAccessExpiringEmail(app, stub, uiLinksStub, durationsStub, 90);
      console.log(email.emailMjml);
    });

    it('should render an access has expired email', async () => {
      const app = getApprovedApplication();
      const email = await renderAccessHasExpiredEmail(app, stub, uiLinksStub, durationsStub);
      console.log(email.emailMjml);
    });

    it('should render an attestation required email', async () => {
      const app = getApprovedApplication();
      const configStub = { durations: durationsStub, email: { links: stub } } as AppConfig;
      const email = await renderAttestationRequiredEmail(app, uiLinksStub, configStub);
      console.log(email.emailMjml);
    });

    it('should render an application paused email', async () => {
      const configStub = { durations: durationsStub, email: { links: stub } } as AppConfig;
      const app = getPausedApplication(configStub);
      const email = await renderApplicationPausedEmail(app, uiLinksStub, configStub);
      console.log(email.emailMjml);
    });

    it('should render an attestation received email', async () => {
      const app = getApprovedApplication();
      app.attestedAtUtc = new Date();
      const email = await renderAttestationReceivedEmail(app, stub);
      console.log(email.emailMjml);
    });
  });
});
