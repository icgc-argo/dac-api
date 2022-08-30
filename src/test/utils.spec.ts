import { Identity } from '@overture-stack/ego-token-middleware';
import { expect } from 'chai';
import moment from 'moment';
import { cloneDeep } from 'lodash';

import { newApplication } from '../domain/state';
import { AppConfig } from '../config';
import { getDaysElapsed, isAttestable, isRenewable } from '../utils/calculations';
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
import { Application } from '../domain/interface';

const mockConfig = {
  durations: {
    attestation: {
      count: 1,
      unitOfTime: 'years',
      daysToAttestation: 45,
    },
  },
} as AppConfig;

const newApplication1: Partial<Application> = newApplication({
  userId: 'abc123',
  tokenInfo: {
    context: {
      user: {
        email: 'test@example.com',
      },
    },
  },
} as Identity);

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
      const canAttest = isAttestable(approvedApp, mockConfig);
      expect(canAttest).to.be.true;
    });

    it('should not be attestable 2 months prior to attestationByUtc date', () => {
      const approvedApp = getApprovedApplication();
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(10, 'months').toDate();
      approvedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(approvedApp, mockConfig);
      expect(canAttest).to.be.false;
    });

    it('should be attestable after attestationByUtc date', () => {
      const pausedApp = getPausedApplication();
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(13, 'months').toDate();
      pausedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(pausedApp, mockConfig);
      expect(canAttest).to.be.true;
    });

    it('should be attestable on the attestationByUtc date', () => {
      const pausedApp = getPausedApplication();
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(1, 'year').toDate();
      pausedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(pausedApp, mockConfig);
      expect(canAttest).to.be.true;
    });
  });

  describe('isRenewable', () => {
    const mockRenewalConfig = {
      durations: {
        expiry: {
          daysToExpiry1: 90,
          daysToExpiry2: 45,
          daysPostExpiry: 90,
          count: 150,
          unitOfTime: 'days',
        },
      },
    } as AppConfig;

    it('should not be renewable in CLOSED after approval state', () => {
      const closedApp = getClosedAfterApprovalApplication();
      const canRenew = isRenewable(closedApp, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in CLOSED before approval state', () => {
      const closedApp = getClosedBeforeApprovalApplication();
      const canRenew = isRenewable(closedApp, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in REJECTED state', () => {
      const rejectedApp = getRejectedApplication();
      const canRenew = isRenewable(rejectedApp, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in REVIEW state', () => {
      const reviewApp = getAppInReview();
      const canRenew = isRenewable(reviewApp, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in DRAFT state', () => {
      const draftApp = cloneDeep({
        ...newApplication1,
        appId: 'DACO-1',
        appNumber: 1,
      }) as Application;
      const canRenew = isRenewable(draftApp, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in SIGN AND SUBMIT state', () => {
      const signSubmitApp = getReadyToSignApp();
      const canRenew = isRenewable(signSubmitApp, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable in REVISIONS REQUESTED state', () => {
      const revisionsApp = getAppInRevisionRequested();
      const canRenew = isRenewable(revisionsApp, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should not be renewable if app has never been APPROVED', () => {
      const readyToSignApp = getReadyToSignApp();
      const canRenew = isRenewable(readyToSignApp, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should be renewable less than 90 days past expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().subtract(45, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app, mockRenewalConfig);
      expect(canRenew).to.be.true;
    });

    it('should not be renewable more than 90 days past expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().subtract(100, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should be renewable exactly 90 days past expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().subtract(90, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app, mockRenewalConfig);
      expect(canRenew).to.be.true;
    });

    it('should be renewable less than 90 days before expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().add(75, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app, mockRenewalConfig);
      expect(canRenew).to.be.true;
    });

    it('should be renewable exactly 90 days before expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().add(90, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app, mockRenewalConfig);
      expect(canRenew).to.be.true;
    });

    it('should not be renewable more than 90 days before expiry', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().add(120, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app, mockRenewalConfig);
      expect(canRenew).to.be.false;
    });

    it('should be renewable on the day it expires', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc();
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      const canRenew = isRenewable(app, mockRenewalConfig);
      expect(canRenew).to.be.true;
    });

    it('should be renewable if app has been renewed before', () => {
      const app = getApprovedApplication();
      expect(app.expiresAtUtc).to.not.eq(undefined);
      const mockExpiresAtUtc = moment.utc().add(75, 'days');
      app.expiresAtUtc = mockExpiresAtUtc.toDate();
      app.isRenewal = true;
      const canRenew = isRenewable(app, mockRenewalConfig);
      expect(canRenew).to.be.true;
    });
  });
});
