import mongoose from 'mongoose';
const AutoIncrement = require('mongoose-sequence')(mongoose);
import { Application } from './interface';

mongoose.set('debug', true);
const Meta = new mongoose.Schema(
  {
    status: { type: String, required: false },
    updated: { type: Boolean, required: false },
    lastUpdatedAtUtc: { type: Date, required: false },
    errorsList: [
      {
        field: { type: String, required: false },
        message: { type: String, required: false },
      },
    ],
  },
  { _id: false },
);

const PersonalInfo = new mongoose.Schema(
  {
    title: { type: String, required: false },
    firstName: { type: String, required: false },
    middleName: { type: String, required: false },
    displayName: { type: String, required: false },
    lastName: { type: String, required: false },
    suffix: { type: String, required: false },
    primaryAffiliation: { type: String, required: false },
    institutionEmail: { type: String, required: false },
    googleEmail: { type: String, required: false },
    website: { type: String, required: false },
    positionTitle: { type: String, required: false },
  },
  { _id: false },
);

const Address = new mongoose.Schema(
  {
    country: { type: String, required: false },
    building: { type: String, required: false },
    streetAddress: { type: String, required: false },
    cityAndProvince: { type: String, required: false },
    postalCode: { type: String, required: false },
  },
  { _id: false },
);

const Collaborator = new mongoose.Schema(
  {
    meta: Meta,
    info: PersonalInfo,
    id: { type: String, required: true },
    type: { type: String, required: true },
  },
  { _id: false },
);

const AgreementItem = new mongoose.Schema(
  {
    name: { type: String, required: false },
    accepted: { type: Boolean, required: false },
  },
  { _id: false },
);

const RevisionRequest = {
  details: { type: String, required: false },
  requested: { type: Boolean, required: false, default: false },
};

const ApplicationUpdate = new mongoose.Schema(
  {
    date: { type: Date, required: false },
    eventType: { type: String, required: false },
    author: { id: { type: String, required: false }, role: { type: String, required: false } },
    daysElapsed: { type: Number, required: false },
    applicationInfo: {
      appType: { type: String, required: false },
      institution: { type: String, required: false },
      country: { type: String, required: false },
      applicant: { type: String, required: false },
      projectTitle: { type: String, required: false },
      ethicsLetterRequired: { type: Boolean, required: false },
    },
  },
  { _id: false },
);

const EthicsLetterDocument = new mongoose.Schema(
  {
    objectId: { type: String, required: false },
    name: { type: String, required: false },
    uploadedAtUtc: { type: Date, required: false },
  },
  { _id: false },
);

const ApprovedAppDocument = new mongoose.Schema(
  {
    approvedAppDocObjId: { type: String, required: false },
    uploadedAtUtc: { type: Date, required: false },
    approvedAppDocName: { type: String, required: false },
    isCurrent: { type: Boolean, required: false },
    approvedAtUtc: { type: Date, required: false },
  },
  { _id: false },
);

const NotificationSentFlags = new mongoose.Schema(
  {
    attestationRequiredNotificationSent: { type: Date, required: false },
    applicationPausedNotificationSent: { type: Date, required: false },
    firstExpiryNotificationSent: { type: Date, required: false },
    secondExpiryNotificationSent: { type: Date, required: false },
    applicationExpiredNotificationSent: { type: Date, required: false },
  },
  { _id: false },
);

const ApplicationSchema = new mongoose.Schema(
  {
    appNumber: { type: Number, unique: true },
    appId: { type: String, index: true },
    state: { type: String, required: true, index: true },
    submitterId: { type: String, required: true },
    submitterEmail: { type: String, required: true },
    submittedAtUtc: { type: Date, required: false },
    approvedAtUtc: { type: Date, required: false },
    expiresAtUtc: { type: Date, required: false },
    closedAtUtc: { type: Date, required: false },
    closedBy: { type: String, required: false },
    denialReason: { type: String, required: false },
    searchValues: { type: [String], index: true, required: false },
    isRenewal: { type: Boolean, required: true },
    attestedAtUtc: { type: Date, required: false },
    pauseReason: { type: String, required: false },
    revisionRequest: {
      applicant: RevisionRequest,
      representative: RevisionRequest,
      projectInfo: RevisionRequest,
      collaborators: RevisionRequest,
      ethicsLetter: RevisionRequest,
      signature: RevisionRequest,
      general: RevisionRequest,
    },
    sections: {
      applicant: {
        meta: Meta,
        info: PersonalInfo,
        address: Address,
      },
      representative: {
        meta: Meta,
        info: PersonalInfo,
        addressSameAsApplicant: { type: Boolean, required: false },
        address: Address,
      },
      collaborators: {
        meta: Meta,
        list: [Collaborator],
      },
      projectInfo: {
        meta: Meta,
        title: { type: String, required: false },
        website: { type: String, required: false },
        background: { type: String, required: false },
        aims: { type: String, required: false },
        methodology: { type: String, required: false },
        summary: { type: String, required: false },
        publicationsURLs: { type: [String], required: false },
      },
      ethicsLetter: {
        meta: Meta,
        declaredAsRequired: { type: Boolean, required: false },
        approvalLetterDocs: [EthicsLetterDocument],
      },
      dataAccessAgreement: {
        meta: Meta,
        agreements: [AgreementItem],
      },
      appendices: {
        meta: Meta,
        agreements: [AgreementItem],
      },
      signature: {
        meta: Meta,
        signedAppDocObjId: { type: String, required: false },
        signedDocName: { type: String, required: false },
        uploadedAtUtc: { type: Date, required: false },
      },
    },
    updates: [ApplicationUpdate],
    approvedAppDocs: [ApprovedAppDocument],
    emailNotifications: NotificationSentFlags,
    sourceAppId: { type: String, required: false },
    renewalAppId: { type: String, required: false },
    renewalPeriodEndDateUtc: { type: Date, required: false },
  },
  {
    timestamps: {
      createdAt: 'createdAtUtc',
      updatedAt: 'lastUpdatedAtUtc',
    },
    minimize: false,
    optimisticConcurrency: true,
  },
);

export type ApplicationDocument = mongoose.Document & Application;

ApplicationSchema.plugin(AutoIncrement, {
  inc_field: 'appNumber',
  start_seq: 1,
});

export const ApplicationModel = mongoose.model<ApplicationDocument>(
  'Application',
  ApplicationSchema,
);
