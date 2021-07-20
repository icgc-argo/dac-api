import renderSubmitted from '../emails/submitted';
import renderNewReview from '../emails/review-new';
import renderRevisionsEmail from '../emails/revisions-requested';
import renderCollaboratorNotifEmail from '../emails/collaborator-notification';
import renderApprovedEmail from '../emails/application-approved';

import { getAppInReview, getAppInRevisionRequested, getApprovedApplication } from './state.spec';
describe('emails', () => {
  describe('email rendering', () => {
    it('should render submission email', async () => {
      const app = getAppInReview();
      const email = await renderSubmitted(app, {
        applyingForAccess: '',
        dataAccessGuide: '',
        reviewGuide: 'https://test.example.com'
      });
      console.log(email.emailMjml);
    });

    it('should render reviewer email', async () => {
      const app = getAppInReview();
      const email = await renderNewReview(app, {lastName: 'Dough', firstName: 'Pizza' } , {
        baseUrl: 'http://daco.icgc-argo.org',
        pathTemplate: '/applications/{id}?section={section}'
      });
      console.log(email.emailMjml);
    });

    it('should render revisions requested email', async () => {
      const app = getAppInRevisionRequested();
      const email = await renderRevisionsEmail(app, {
        email: {
          links: {
            applyingForAccess: 'https://www.google.com',
            reviewGuide: '',
          }
        },
        ui: {
          baseUrl: 'http://daco.icgc-argo.org',
          sectionPath: '/applications/{id}?section={section}'
        }
      } as any);
      console.log(email.emailMjml);
    });

    // it('should render collaborator notification email', async () => {
    //   const app = getAppInRevisionRequested();
    //   const email = await renderCollaboratorNotifEmail(app, {
    //     dataAccessGuide: 'https://www.google.com',
    //     reviewGuide: '',
    //     applyingForAccess: '',
    //   });
    //   console.log(email.emailMjml);
    // });

    it('should render approved email', async () => {
      const app = getApprovedApplication();
      const email = await renderApprovedEmail(app, {
        dataAccessGuide: 'https://www.google.com',
        reviewGuide: '',
        applyingForAccess: '',
      });
      console.log(email.emailMjml);
    });
  });
});