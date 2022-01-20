import renderSubmitted from '../emails/submitted';
import renderNewReview from '../emails/review-new';
import renderRevisionsEmail from '../emails/revisions-requested';
import renderApprovedEmail from '../emails/application-approved';
import renderCollaboratorNotificationEmail from '../emails/collaborator-notification';
import renderCollaboratorRemovedEmail from '../emails/collaborator-removed';
import renderClosedEmail from '../emails/closed-approved';
import rejected from '../emails/rejected';
import renderAccessExpiringEmail from '../emails/access-expiring';

import {
  getAppInReview,
  getAppInRevisionRequested,
  getApprovedApplication,
  getRejectedApplication,
} from './state.spec';
import { Collaborator } from '../domain/interface';

const stub = {
  dataAccessGuide: '',
  reviewGuide: '',
  applyingForAccess: '',
  revisionsRequestedGuide: '',
  approvalGuide: '',
  dacoSurvey: '',
  accessRenewalGuide: '',
};
const expiryStub = {
  daysToExpiry1: 90,
  daysToExpiry2: 45,
  daysPostExpiry: 90,
};

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
      const email = await renderAccessExpiringEmail(app, stub, uiLinksStub, expiryStub, 45);
      console.log(email.emailMjml);
    });

    it('should render an access expiring in 90 days email', async () => {
      const app = getApprovedApplication();
      const email = await renderAccessExpiringEmail(app, stub, uiLinksStub, expiryStub, 90);
      console.log(email.emailMjml);
    });
  });
});
