import { UserIdentity } from '@overture-stack/ego-token-middleware';
import { expect } from 'chai';
import moment from 'moment';

import { cloneDeep } from 'lodash';
import { Application } from '../src/domain/interface';
import { newApplication } from '../src/domain/state';
import { getDaysElapsed, isAttestable, isExpirable, isRenewable } from '../src/utils/calculations';
import { mockApplicantToken, mockedConfig } from './mocks.spec';
import {
  getAppInReview,
  getAppInRevisionRequested,
  getApprovedApplication,
  getClosedAfterApprovalApplication,
  getClosedBeforeApprovalApplication,
  getPausedApplication,
  getReadyToSignApp,
  getRejectedApplication,
} from './state.spec';

const newApplication1: Partial<Application> = newApplication(mockApplicantToken as UserIdentity);

describe('utils', () => {
  describe('daysElapsed', () => {
    it('should return a negative number when comparing future dates', () => {
      const now = moment.utc().toDate();
      const tenDaysLater = moment(now).add(10, 'days').toDate();
      const difference = getDaysElapsed(now, tenDaysLater);

      expect(difference).to.eq(-10);
    });

    it('should return a positive number when comparing past dates', () => {
      const now = moment.utc().toDate();
      const fifteenDaysBefore = moment(now).subtract(15, 'days').toDate();
      const difference = getDaysElapsed(now, fifteenDaysBefore);

      expect(difference).to.eq(15);
    });

    it('should return 0 when dates are in the same 24 hour period UTC', () => {
      const now = moment.utc().toDate();
      const laterSameDay = moment(now).add(5, 'minutes').toDate();
      const difference = getDaysElapsed(now, laterSameDay);

      expect(difference).to.eq(0);
    });

    it('should return 1 when dates are less than 24hrs apart but on different calendar days UTC', () => {
      const baseDate = moment.utc([2022, 5, 27]).add(16, 'hours').toDate();
      const laterDate = moment.utc([2022, 5, 28]).add(5, 'minutes').toDate();
      const difference = getDaysElapsed(baseDate, laterDate);

      expect(Math.abs(difference)).to.eq(1);
    });
  });

  describe('isAttestable', () => {
    it('should be attestable 1 month prior to attestationByUtc date', () => {
      const approvedApp = getApprovedApplication();
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(11, 'months').toDate();
      approvedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(approvedApp);
      expect(canAttest).to.be.true;
    });

    it('should not be attestable 2 months prior to attestationByUtc date', () => {
      const approvedApp = getApprovedApplication();
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(10, 'months').toDate();
      approvedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(approvedApp);
      expect(canAttest).to.be.false;
    });

    it('should be attestable after attestationByUtc date', () => {
      const pausedApp = getPausedApplication();
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(13, 'months').toDate();
      pausedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(pausedApp);
      expect(canAttest).to.be.true;
    });

    it('should be attestable on the attestationByUtc date', () => {
      const pausedApp = getPausedApplication();
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(1, 'year').toDate();
      pausedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(pausedApp);
      expect(canAttest).to.be.true;
    });
  });

  describe('isRenewable', () => {
    it('should not be renewable in CLOSED after approval state', () => {
      const closedApp = getClosedAfterApprovalApplication();
      const canRenew = isRenewable(closedApp);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in CLOSED before approval state', () => {
      const closedApp = getClosedBeforeApprovalApplication();
      const canRenew = isRenewable(closedApp);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in REJECTED state', () => {
      const rejectedApp = getRejectedApplication();
      const canRenew = isRenewable(rejectedApp);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in REVIEW state', () => {
      const reviewApp = getAppInReview();
      const canRenew = isRenewable(reviewApp);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in DRAFT state', () => {
      const draftApp = cloneDeep({
        ...newApplication1,
        appId: 'DACO-1',
        appNumber: 1,
      }) as Application;
      const canRenew = isRenewable(draftApp);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in SIGN AND SUBMIT state', () => {
      const signSubmitApp = getReadyToSignApp();
      const canRenew = isRenewable(signSubmitApp);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in REVISIONS REQUESTED state', () => {
      const revisionsApp = getAppInRevisionRequested();
      const canRenew = isRenewable(revisionsApp);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable if app has never been APPROVED', () => {
      const readyToSignApp = getReadyToSignApp();
      const canRenew = isRenewable(readyToSignApp);
      expect(canRenew).to.be.false;
    });

    it('should be renewable less than 90 days past expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().subtract(45, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app);
      expect(canRenew).to.be.true;
    });

    it('should not be renewable more than 90 days past expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().subtract(100, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app);
      expect(canRenew).to.be.false;
    });

    it('should be renewable exactly 90 days past expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().subtract(90, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app);
      expect(canRenew).to.be.true;
    });

    it('should be renewable less than 90 days before expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().add(75, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app);
      expect(canRenew).to.be.true;
    });

    it('should be renewable exactly 90 days before expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().add(90, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app);
      expect(canRenew).to.be.true;
    });

    it('should not be renewable more than 90 days before expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().add(120, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app);
      expect(canRenew).to.be.false;
    });

    it('should be renewable on the day it expires', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc();
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app);
      expect(canRenew).to.be.true;
    });

    it('should be renewable in PAUSED state', () => {
      const app = getPausedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().add(75, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app);
      expect(canRenew).to.be.true;
    });

    // TODO: implement
    it('should not be renewable if a renewal app has already been created', () => {});
    // TODO: implement
    it('should be renewable in EXPIRED state', () => {});
  });

  describe('isExpirable', () => {
    it('should be expirable on the day of expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      // set expiry to today
      app.expiresAtUtc = moment.utc().toDate();
      const canExpire = isExpirable(app);
      expect(canExpire).to.be.true;
    });

    it('should not be expirable before the day of expiry', () => {
      const {
        durations: {
          expiry: { count, unitOfTime },
        },
      } = mockedConfig();
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      // set expiry 1 year in the future
      const mockExpiresAtUtc = moment.utc().add(count - 1, unitOfTime);
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canExpire = isExpirable(app);
      expect(canExpire).to.be.false;
    });

    it('should be expirable after the day of expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      // set expiry 5 days before today
      app.expiresAtUtc = moment.utc().subtract(5, 'days').toDate();
      const canExpire = isExpirable(app);
      expect(canExpire).to.be.true;
    });

    it('should not be expirable if it is has never been approved', () => {
      const app = getReadyToSignApp();
      expect(app.expiresAtUtc).to.eq(undefined);
      const canExpire = isExpirable(app);
      expect(canExpire).to.be.false;
    });
  });
});
