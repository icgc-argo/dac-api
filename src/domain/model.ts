import mongoose from 'mongoose';
const AutoIncrement = require('mongoose-sequence')(mongoose);
import { Application } from './interface';

mongoose.set('debug', true);
const Meta = new mongoose.Schema({
  status: { type: String, required: false },
  errorsList: [{
    field: { type: String, required: false },
    message: { type: String, required: false }
  }]
}, { _id: false });

const PersonalInfo = new mongoose.Schema({
  title: { type: String, required: false },
  firstName: { type: String, required: false },
  middleName: { type: String, required: false },
  displayName: { type: String, required: false},
  lastName: { type: String, required: false },
  suffix: { type: String, required: false },
  primaryAffiliation: { type: String, required: false },
  institutionEmail: { type: String, required: false },
  googleEmail: { type: String, required: false },
  institutionWebsite: { type: String, required: false },
  positionTitle: { type: String, required: false }
}, { _id: false });

const Address = new mongoose.Schema({
  country:  { type: String, required: false },
  building:  { type: String, required: false },
  streetAddress: { type: String, required: false },
  cityAndProvince:  { type: String, required: false },
  postalCode:  { type: String, required: false }
}, { _id: false });

const Collaborator = new mongoose.Schema({
  meta: Meta,
  info: PersonalInfo,
  type: { type: String, required: false },
}, { _id: false });

const AgreementItem = new mongoose.Schema({
  name: { type: String, required: false },
  accepted: { type: Boolean, required: false }
}, { _id: false });

const RevisionRequest = {
  details: { type: String, required: false },
  requested: { type: Boolean, required: false, default: false },
};

const ApplicationUpdate =  new mongoose.Schema({
  details: { type: String, required: false },
  type: { type: String, required: false },
  date: { type: Date, required: false },
});

const EthicsLetterDocument =  new mongoose.Schema({
  objectId: { type: String, required: false },
  uploadedAtUtc: { type: Date, required: false },
});

const ApplicationSchema = new mongoose.Schema({
    appNumber: { type: Number, unique: true },
    appId: { type: String,  index: true },
    state: { type: String, required: true, index: true},
    submitterId: { type: String, required: true },
    submitterEmail: { type: String, required: true },
    signedAppDocObjId: { type: String, required: false },
    submittedAtUtc: { type: Date, required: false },
    approvedAtUtc: { type: Date, required: false },
    expiresAtUtc: { type: Date, required: false },
    lastUpdatedAtDate: {type: String, index: true},
    expiresAtDate: { type: String, index: true },
    closedAtUtc:  { type: Date, required: false },
    closedBy: { type: String, required: false },
    denialReason: { type: String, required: false },
    searchValues: { type: [String], index: true, required: false },
    revisionRequest: {
      applicant: RevisionRequest,
      representative: RevisionRequest,
      projectInfo: RevisionRequest,
      collaborators: RevisionRequest,
      signature: RevisionRequest,
      general: RevisionRequest
    },
    sections: {
      terms: {
        meta: Meta,
        agreement: AgreementItem
      },
      applicant: {
        meta: Meta,
        info: PersonalInfo,
        address: Address
      },
      representative: {
        meta: Meta,
        info: PersonalInfo,
        addressSameAsApplicant: { type: Boolean, required: false },
        address: Address
      },
      collaborators: {
        meta: Meta,
        list: [Collaborator],
      },
      projectInfo: {
        meta: Meta,
        title: { type: String, required: false },
        website: { type: String, required: false },
        abstract: { type: String, required: false },
        aims: { type: String, required: false },
        methodology: { type: String, required: false },
        publicationsURLs: { type: [String], required: false },
      },
      ethicsLetter: {
        meta: Meta,
        declaredAsRequired: { type: Boolean, required: false },
        approvalLetterDocs: EthicsLetterDocument,
      },
      ITAgreements: {
        meta: Meta,
        agreements: [AgreementItem],
      },
      dataAccessAgreement: {
        meta: Meta,
        agreements: [AgreementItem],
      },
      appendices: {
        meta: Meta,
        agreements: [AgreementItem],
      }
    },
    updates: [ApplicationUpdate]
  },
  {
    timestamps: {
      createdAt: 'createdAtUtc',
      updatedAt: 'lastUpdatedAtUtc'
    },
    minimize: false, optimisticConcurrency: true
  },
);

ApplicationSchema.index({
  'sections.applicant.info.displayName': 1,
});

ApplicationSchema.index({
  'sections.applicant.info.primaryAffiliation': 1,
});

ApplicationSchema.index({
  'sections.applicant.info.googleEmail': 1,
});

ApplicationSchema.index({
  'lastUpdatedAtDate': 1,
});

ApplicationSchema.index({
  'expiresAtDate': 1,
});

export type ApplicationDocument = mongoose.Document & Application;

ApplicationSchema.plugin(AutoIncrement, {
  inc_field: 'appNumber',
  start_seq: 1,
});


export const ApplicationModel = mongoose.model<ApplicationDocument>(
  'Application',
  ApplicationSchema,
);
