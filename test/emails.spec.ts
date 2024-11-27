import renderAccessExpiringEmail from '../src/emails/access-expiring';
import renderAccessHasExpiredEmail from '../src/emails/access-has-expired';
import renderApprovedEmail from '../src/emails/application-approved';
import renderApplicationPausedEmail from '../src/emails/application-paused';
import renderAttestationReceivedEmail from '../src/emails/attestation-received';
import renderAttestationRequiredEmail from '../src/emails/attestation-required';
import renderClosedEmail from '../src/emails/closed-approved';
import renderCollaboratorNotificationEmail from '../src/emails/collaborator-notification';
import renderCollaboratorRemovedEmail from '../src/emails/collaborator-removed';
import rejected from '../src/emails/rejected';
import renderNewReview from '../src/emails/review-new';
import renderRenewalReviewEmail from '../src/emails/review-renewal';
import renderRevisionsEmail from '../src/emails/revisions-requested';
import renderSubmitted from '../src/emails/submitted';

import { Collaborator } from '../src/domain/interface';
import { mockedConfig } from './mocks.spec';
import {
  getAppInReview,
  getAppInRevisionRequested,
  getApprovedApplication,
  getExpiredApplication,
  getPausedApplication,
  getRejectedApplication,
} from './state.spec';

const emailTestConfig = mockedConfig();
const emailLinksStub = emailTestConfig.email.links;
const uiLinksStub = {
  baseUrl: emailTestConfig.ui.baseUrl,
  pathTemplate: emailTestConfig.ui.sectionPath,
};

describe('emails', () => {
  // To view a rendered email, log the result of an email function and paste into https://mjml.io/try-it-live
  describe('email rendering', () => {
    it('should render submission email', async () => {
      const app = getAppInReview();
      const email = await renderSubmitted(app, emailLinksStub);
    });

    it('should render reviewer email', async () => {
      const app = getAppInReview();
      const email = await renderNewReview(app);
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
    });

    it('should render approved email', async () => {
      const app = getApprovedApplication();
      const email = await renderApprovedEmail(app, emailLinksStub);
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
        ...emailLinksStub,
        dataAccessGuide: 'https://www.google.com',
      });
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
        ...emailLinksStub,
      });
    });

    it('should render approved application closed email', async () => {
      const app = getApprovedApplication();
      const email = await renderClosedEmail(app, emailLinksStub);
    });

    it('should render rejected email', async () => {
      const app = getRejectedApplication();
      const email = await rejected(app, emailLinksStub);
    });

    it('should render an access expiring email', async () => {
      const app = getApprovedApplication();
      const email = await renderAccessExpiringEmail(app, emailLinksStub, uiLinksStub);
    });

    it('should render an access has expired email', async () => {
      const app = getExpiredApplication();
      const email = await renderAccessHasExpiredEmail(app, emailLinksStub, uiLinksStub);
    });

    it('should render an attestation required email', async () => {
      const app = getApprovedApplication();
      const email = await renderAttestationRequiredEmail(app, uiLinksStub, emailTestConfig);
    });

    it('should render an application paused email', async () => {
      const app = getPausedApplication();
      const email = await renderApplicationPausedEmail(app, uiLinksStub, emailTestConfig);
    });

    it('should render an attestation received email', async () => {
      const app = getApprovedApplication();
      app.attestedAtUtc = new Date();
      const email = await renderAttestationReceivedEmail(app, emailLinksStub);
    });

    it('should render a renewal for review email', async () => {
      const app = getAppInReview();
      app.isRenewal = true;
      const email = await renderRenewalReviewEmail(app);
    });
  });
});
