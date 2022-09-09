import { expect } from 'chai';
import moment from 'moment';
import { AppConfig } from '../config';
import { getDaysElapsed, isAttestable, isPauseableDueToAttestation } from '../utils/calculations';
import { getAppInReview, getApprovedApplication, getPausedApplication } from './state.spec';

const mockConfig = {
  durations: {
    attestation: {
      count: 1,
      unitOfTime: 'years',
      daysToAttestation: 45,
    },
  },
} as AppConfig;

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
      const pausedApp = getPausedApplication(mockConfig);
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(13, 'months').toDate();
      pausedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(pausedApp, mockConfig);
      expect(canAttest).to.be.true;
    });

    it('should be attestable on the attestationByUtc date', () => {
      const pausedApp = getPausedApplication(mockConfig);
      const now = moment.utc().toDate();
      const mockApprovalDate = moment(now).subtract(1, 'year').toDate();
      pausedApp.approvedAtUtc = mockApprovalDate;
      const canAttest = isAttestable(pausedApp, mockConfig);
      expect(canAttest).to.be.true;
    });
  });

  // these apply only to pausing applications due to incomplete attestation
  describe('isPauseableDueToAttestation', () => {
    it('should be pauseable on attestation by date if in APPROVED state', () => {
      const approvedApp = getApprovedApplication();
      approvedApp.approvedAtUtc = moment.utc().subtract(1, 'year').toDate();
      expect(approvedApp.state).to.eq('APPROVED');
      const pauseable = isPauseableDueToAttestation(approvedApp, mockConfig);
      expect(pauseable).to.be.true;
    });

    it('should be pauseable after the attestation by date if still in APPROVED state', () => {
      const approvedApp = getApprovedApplication();
      approvedApp.approvedAtUtc = moment.utc().subtract(400, 'days').toDate();
      expect(approvedApp.state).to.eq('APPROVED');
      const pauseable = isPauseableDueToAttestation(approvedApp, mockConfig);
      expect(pauseable).to.be.true;
    });

    it('should not be pauseable before the attestation by date', () => {
      const approvedApp = getApprovedApplication();
      const pauseable = isPauseableDueToAttestation(approvedApp, mockConfig);
      expect(pauseable).to.be.false;
    });

    it('should not be pauseable if not in APPROVED state', () => {
      const reviewApp = getAppInReview();
      const pauseable = isPauseableDueToAttestation(reviewApp, mockConfig);
      expect(pauseable).to.be.false;
    });

    it('should not be pauseable if already attested', () => {
      const approvedApp = getApprovedApplication();
      approvedApp.attestedAtUtc = new Date();
      const pauseable = isPauseableDueToAttestation(approvedApp, mockConfig);
      expect(pauseable).to.be.false;
    });
  });
});
