import renderSubmitted from '../emails/submitted';
import renderNewReview from '../emails/review-new';
import { getAppInReview } from './state.spec';
describe('emails', () => {
  describe('email rendering', () => {
    it('should render submission email', () => {
      const app = getAppInReview();
      const email = renderSubmitted(app);
      console.log(email.emailMjml);
    });

    it('should render reviewer email', () => {
      const app = getAppInReview();
      const email = renderNewReview(app, {lastName: 'Dough', firstName: 'Pizza' } , {
        baseUrl: 'http://daco.icgc-argo.org',
        pathTemplate: '/applications/{id}?section={section}'
      });
      console.log(email.emailMjml);
    });
  });
});