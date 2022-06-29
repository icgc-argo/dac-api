import { Identity } from '@overture-stack/ego-token-middleware';
import {
  Address,
  Application,
  Collaborator,
  DacoRole,
  TERMS_AGREEMENT_NAME,
  UpdateApplication,
} from '../domain/interface';
import { ApplicationStateManager, newApplication } from '../domain/state';
import { expect } from 'chai';
import _ from 'lodash';
import { BadRequest, ConflictError } from '../utils/errors';
import { c } from '../utils/misc';
import { AppConfig } from '../config';

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

describe('state manager', () => {
  it('should update applicant info', () => {
    const emptyApp: Application = _.cloneDeep({
      ...newApplication1,
      appId: 'DACO-1',
      appNumber: 1,
    }) as Application;
    const state = new ApplicationStateManager(emptyApp, mockConfig);
    const updatePart: Partial<UpdateApplication> = {
      sections: {
        applicant: {
          info: {
            firstName: 'Bashar',
            lastName: 'Allabadi',
            googleEmail: 'bashar@example.com',
            primaryAffiliation: 'OICR',
          },
        },
      },
    };

    const result = state.updateApp(updatePart, false, { id: '1', role: DacoRole.SUBMITTER });
    expect(result.sections.applicant.info).to.include(updatePart.sections?.applicant?.info);
  });

  it('should update representative info', () => {
    const app: Application = getReadyToSignApp();
    expect(app.sections.representative.address?.country).to.eq('Canada');
    const state = new ApplicationStateManager(app, mockConfig);
    const updatePart: Partial<UpdateApplication> = {
      sections: {
        representative: {
          address: {
            country: 'Palestine',
          },
        },
      },
    };

    state.updateApp(updatePart, false, { id: '1', role: DacoRole.SUBMITTER });
    expect(state.currentApplication.sections.representative.address?.country).to.eq('Palestine');

    const updatePart2: Partial<UpdateApplication> = {
      sections: {
        representative: {
          addressSameAsApplicant: true,
        },
      },
    };

    state.updateApp(updatePart2, false, { id: '1', role: DacoRole.SUBMITTER });
    expect(state.currentApplication.sections.representative.address).to.include({
      building: '',
      cityAndProvince: '',
      country: '',
      postalCode: '',
      streetAddress: '',
    } as Address);
  });

  describe('collaborators', () => {
    it('1) should add collaborator', () => {
      const emptyApp: Application = _.cloneDeep({
        ...newApplication1,
        appId: 'DACO-1',
        appNumber: 1,
      }) as Application;
      const state = new ApplicationStateManager(emptyApp, mockConfig);
      const collab: Collaborator = {
        meta: {
          errorsList: [],
          status: 'COMPLETE',
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
          displayName: 'Bashar Allabadi',
          website: '',
        },
        type: 'personnel',
      };

      const result = state.addCollaborator(collab, 'user123', false);
      expect(result.sections.collaborators.list[0]).to.deep.include(collab);
      expect(result.sections.collaborators.list[0].id).to.not.be.empty;
      expect(result.sections.collaborators.meta.status).to.eq('COMPLETE');
    });

    it('2) should not add duplicate collaborator', () => {
      const emptyApp: Application = _.cloneDeep({
        ...newApplication1,
        appId: 'DACO-1',
        appNumber: 1,
      }) as Application;
      const state = new ApplicationStateManager(emptyApp, mockConfig);
      const collab: Collaborator = {
        meta: {
          errorsList: [],
          status: 'COMPLETE',
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
          displayName: 'Bashar Allabadi',
          website: '',
        },
        type: 'personnel',
      };

      const result = state.addCollaborator(collab, 'user123', false);
      expect(result.sections.collaborators.list[0]).to.deep.include(collab);
      expect(result.sections.collaborators.list[0].id).to.not.be.empty;
      expect(result.sections.collaborators.meta.status).to.eq('COMPLETE');

      const collab2: Collaborator = {
        meta: {
          errorsList: [],
          status: 'COMPLETE',
        },
        info: {
          firstName: 'Bashar1',
          lastName: 'Allabadi2',
          googleEmail: 'bashar@example.com',
          primaryAffiliation: 'OICR',
          institutionEmail: 'adsa11@example.com',
          middleName: '',
          positionTitle: 'Manager',
          suffix: '',
          title: '',
          displayName: '',
          website: '',
        },
        type: 'personnel',
      };
      try {
        state.addCollaborator(collab, 'user123', false);
      } catch (err) {
        if (err instanceof ConflictError) {
          return true;
        }
      }
      throw new Error('test failed expected an error');
    });

    it('3) should check collaborator primary affiliation', () => {
      const app: Application = _.cloneDeep({
        ...newApplication1,
        appId: 'DACO-1',
        appNumber: 1,
      }) as Application;
      app.sections.applicant.info.primaryAffiliation = 'ACME';
      const state = new ApplicationStateManager(app, mockConfig);
      const collab: Collaborator = {
        meta: {
          errorsList: [],
          status: 'COMPLETE',
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

      try {
        state.addCollaborator(collab, 'user123', false);
      } catch (e) {
        expect((e as BadRequest).info.errors[0]).to.include({
          field: 'primaryAffiliation',
          message: 'Primary Affiliation must be the same as the Applicant',
        });
      }

      // add with correct PA
      collab.info.primaryAffiliation = 'ACME';
      const app2 = state.addCollaborator(collab, 'user123', false);
      app2.sections.collaborators.list[0].id = 'collab-1';
      expect(app2.sections.collaborators.list[0].meta.status).to.eq('COMPLETE');

      // change applicant PA and observe collaborator goes to incomplete
      const state2 = new ApplicationStateManager(app2, mockConfig);
      const app3 = state2.updateApp(
        {
          sections: {
            applicant: {
              info: {
                primaryAffiliation: 'OICR',
              },
            },
          },
        },
        false,
        { id: '1', role: DacoRole.SUBMITTER },
      );
      expect(app3.sections.collaborators.list[0].meta.status).to.eq('INCOMPLETE');

      // fix the collaborator to match applicant PA again
      collab.id = 'collab-1';
      collab.info.primaryAffiliation = 'OICR';
      const state3 = new ApplicationStateManager(app3, mockConfig);
      const app4 = state3.updateCollaborator(collab, { id: 'user123', role: DacoRole.SUBMITTER });
      expect(app4.sections.collaborators.list[0].meta.status).to.eq('COMPLETE');
    });

    it('4) should change back to sign & submit when changing Primary affiliation in applicant in state SIGN & SUBMIT', () => {
      const filledApp: Application = getReadyToSignApp();
      const state = new ApplicationStateManager(filledApp, mockConfig);
      const collab: Collaborator = {
        meta: {
          errorsList: [],
          status: 'COMPLETE',
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
          displayName: 'Bashar Allabadi',
          website: '',
        },
        type: 'personnel',
      };

      const result = state.addCollaborator(collab, 'user123', false);
      result.sections.collaborators.list[0].id = 'collab-1';
      expect(result.state).to.eq('SIGN AND SUBMIT');

      const result2 = new ApplicationStateManager(result, mockConfig).updateApp(
        {
          sections: {
            applicant: {
              info: {
                primaryAffiliation: 'A',
              },
            },
            representative: {
              info: {
                primaryAffiliation: 'A',
              },
            },
          },
        },
        false,
        { id: '1', role: DacoRole.SUBMITTER },
      );

      expect(result2.state).to.eq('DRAFT');

      // fix the collaborator to match applicant PA again
      collab.id = 'collab-1';
      collab.info.primaryAffiliation = 'A';
      const stateMgr = new ApplicationStateManager(result2, mockConfig);
      const app4 = stateMgr.updateCollaborator(collab, { id: 'user123', role: DacoRole.SUBMITTER });
      expect(app4.sections.collaborators.list[0].meta.status).to.eq('COMPLETE');
      expect(app4.state).to.eq('SIGN AND SUBMIT');
    });
  });

  it('should change to sign & submit', () => {
    const filledApp: Application = getReadyToSignApp();
  });

  it('should change to review', () => {
    const filledApp: Application = getAppInReview();
  });

  it('should request revision for section', () => {
    const app: Application = getAppInReview();
    const state = new ApplicationStateManager(app, mockConfig);
    const updated = state.updateApp(
      {
        state: 'REVISIONS REQUESTED',
        revisionRequest: {
          applicant: {
            requested: true,
            details: 'Please provide more accurate address',
          },
          representative: {
            requested: true,
            details: 'asdasd',
          },
          projectInfo: {
            requested: false,
            details: '',
          },
          collaborators: {
            requested: false,
            details: '',
          },
          ethicsLetter: {
            requested: true,
            details: 'Ethics approval letter is not signed',
          },
          signature: {
            requested: true,
            details: 'signature need to be signed',
          },
          general: {
            requested: true,
            details: 'Some generic comment',
          },
        },
      },
      true,
      { id: '1', role: DacoRole.ADMIN },
    );

    const userApp = state.prepareApplicationForUser(false);
    expect(userApp.sections.representative.meta.status).to.eq('REVISIONS REQUESTED');
  });

  it('should change to sign and submit when revisions requested on signature section only', () => {
    const app: Application = getAppInReview();
    const state = new ApplicationStateManager(app, mockConfig);
    const updated = state.updateApp(
      {
        state: 'REVISIONS REQUESTED',
        revisionRequest: {
          applicant: {
            requested: false,
            details: '',
          },
          representative: {
            requested: false,
            details: '',
          },
          projectInfo: {
            requested: false,
            details: '',
          },
          collaborators: {
            requested: false,
            details: '',
          },
          ethicsLetter: {
            requested: false,
            details: '',
          },
          signature: {
            requested: true,
            details: 'signature needs to be signed',
          },
          general: {
            requested: false,
            details: '',
          },
        },
      },
      true,
      { id: '1', role: DacoRole.ADMIN },
    );

    const userApp = state.prepareApplicationForUser(false);
    expect(userApp.sections.signature.meta.status).to.eq('REVISIONS REQUESTED');
    expect(userApp.state).to.eq('SIGN AND SUBMIT');
  });

  it('should transition an approved app to PAUSED state', () => {
    const app: Application = getApprovedApplication();
    const state = new ApplicationStateManager(app, mockConfig);
    const systemUser = { id: 'DACO-SYSTEM-1', role: DacoRole.SYSTEM };
    state.updateApp({ state: 'PAUSED', pauseReason: 'PENDING ATTESTATION' }, false, systemUser);
    const userApp = state.prepareApplicationForUser(true);

    expect(userApp.state).to.eq('PAUSED');
    expect(userApp.pauseReason).to.not.be.undefined;
    expect(userApp.pauseReason).to.eq('PENDING ATTESTATION');
    expect(userApp.approvedAtUtc.toDateString()).to.eq(app.approvedAtUtc.toDateString());
    expect(userApp.searchValues).to.include('PAUSED');
  });

  it('should not pause a non-approved app', () => {
    const app: Application = getAppInRevisionRequested();
    const state = new ApplicationStateManager(app, mockConfig);
    const systemUser = { id: 'DACO-SYSTEM-1', role: DacoRole.SYSTEM };
    state.updateApp({ state: 'PAUSED', pauseReason: 'PENDING ATTESTATION' }, false, systemUser);
    const userApp = state.prepareApplicationForUser(true);

    expect(userApp.state).to.eq('REVISIONS REQUESTED');
    expect(userApp.pauseReason).to.be.undefined;
    expect(userApp.searchValues).to.not.include('PAUSED');
  });

  it('should not modify an app already in PAUSED state', () => {
    const app: Application = getPausedApplication();
    const state = new ApplicationStateManager(app, mockConfig);
    const systemUser = { id: 'DACO-SYSTEM-1', role: DacoRole.SYSTEM };
    state.updateApp(
      { state: 'PAUSED', pauseReason: 'A different reason to pause' },
      false,
      systemUser,
    );
    const userApp = state.prepareApplicationForUser(true);

    expect(userApp.state).to.eq('PAUSED');
    expect(userApp.pauseReason).to.eq('PENDING ATTESTATION');
  });
});

export function getReadyToSignApp() {
  const app: Application = _.cloneDeep({
    ...newApplication1,
    appId: 'DACO-2341',
    appNumber: 1,
  }) as Application;
  const updatePart: UpdateApplication['sections'] = _.pick(_.cloneDeep(app), 'sections').sections;
  c(updatePart.applicant).info = getRandomInfo();
  c(updatePart.applicant).address = getAddress();
  c(updatePart.representative).address = getAddress();
  c(updatePart.representative).info = _.omit(getRandomInfo(), 'googleEmail');
  c(updatePart.dataAccessAgreement).agreements.forEach((ag) => (ag.accepted = true));
  c(updatePart.appendices).agreements.forEach((ag) => (ag.accepted = true));
  c(updatePart.ethicsLetter).declaredAsRequired = false;
  const exactly100words =
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum in ex tellus. Vestibulum blandit egestas pharetra. Proin porttitor hendrerit ligula. Aliquam mattis in elit nec dictum. Nam ante neque, cursus ac tortor sit amet, faucibus lacinia metus. Integer vestibulum nulla mauris, a iaculis nisl auctor et. Suspendisse potenti. Nulla porttitor orci ac sapien feugiat, eu rhoncus ante iaculis. Vestibulum id neque sit amet mauris molestie dictum in sit amet odio. Integer mattis enim non ultrices aliquet. Aenean maximus leo lacus, in fringilla ex suscipit eget. Nam felis dolor, bibendum et lobortis sit amet, sodales eu orci. Nunc at elementum ex.';
  updatePart.projectInfo = {
    aims: exactly100words,
    background: exactly100words,
    methodology: exactly100words,
    summary: exactly100words,
    title: 'title title title',
    website: 'http://www.institutionWebsite.web',
    publicationsURLs: ['http://www.website.web', 'http://abcd.efg.ca', 'http://hijk.lmnop.qrs'],
  };
  const state = new ApplicationStateManager(app, mockConfig);
  const newState = state.updateApp(
    {
      sections: updatePart,
    },
    false,
    { id: '1', role: DacoRole.SUBMITTER },
  );
  expect(newState.state).to.eq('SIGN AND SUBMIT');
  return newState;
}

export function getAppInReview() {
  const app = getReadyToSignApp();
  const state = new ApplicationStateManager(app, mockConfig);
  const appAfterSign = state.addDocument('12345', 'signed.pdf', 'SIGNED_APP', 'user123', false);
  const updatePart: Partial<UpdateApplication> = {
    state: 'REVIEW',
  };
  const state2 = new ApplicationStateManager(appAfterSign, mockConfig);
  const result = state2.updateApp(updatePart, false, { id: '1', role: DacoRole.SUBMITTER });
  expect(result.state).to.eq('REVIEW');
  return result;
}

export function getApprovedApplication() {
  const app = getAppInReview();
  const state = new ApplicationStateManager(app, mockConfig);
  const updatePart: Partial<UpdateApplication> = {
    state: 'APPROVED',
  };
  const result = state.updateApp(updatePart, true, { id: '1', role: DacoRole.ADMIN });
  expect(result.state).to.eq('APPROVED');
  expect(result.approvedAtUtc).to.not.eq(undefined);
  return result;
}

export function getPausedApplication() {
  const app = getApprovedApplication();
  const state = new ApplicationStateManager(app, mockConfig);
  const updatePart: Partial<UpdateApplication> = {
    state: 'PAUSED',
    pauseReason: 'PENDING ATTESTATION',
  };
  const result = state.updateApp(updatePart, true, { id: 'DACO-SYSTEM', role: DacoRole.SYSTEM });
  expect(result.state).to.eq('PAUSED');
  expect(result.approvedAtUtc).to.not.eq(undefined);
  expect(result.pauseReason).to.exist;
  return result;
}

export function getRejectedApplication() {
  const app = getAppInReview();
  const state = new ApplicationStateManager(app, mockConfig);
  const updatePart: Partial<UpdateApplication> = {
    state: 'REJECTED',
    denialReason: 'Your plans to use the data is not accepted.',
  };
  const result = state.updateApp(updatePart, true, { id: '1', role: DacoRole.ADMIN });
  expect(result.state).to.eq('REJECTED');
  expect(result.lastUpdatedAtUtc).to.not.eq(undefined);
  return result;
}

export function getAppInRevisionRequested() {
  const app = getAppInReview();
  const state = new ApplicationStateManager(app, mockConfig);
  const update: Partial<UpdateApplication> = {
    revisionRequest: {
      applicant: {
        details: `hello hello, did you brush you teeth ? <br/>
                  did you wash your hands <br/>
                  did you comb your hair <br/>
                  hello hello`,
        requested: true,
      },
      ethicsLetter: {
        details: `Problem problem`,
        requested: true,
      },
      projectInfo: {
        details: 'hello... is it me you lookin for',
        requested: true,
      },
      general: {
        details:
          "General Kenobi... hello there, a surprise for sure, but a welcomed one. let's see how it renders",
        requested: true,
      },
    },
    state: 'REVISIONS REQUESTED',
  };
  const result = state.updateApp(update, true, { id: '1', role: DacoRole.ADMIN });
  expect(result.state).to.eq('REVISIONS REQUESTED');
  return result;
}

function getAddress(): Address {
  return {
    building: 'MARS',
    cityAndProvince: 'Toronto, Ontario',
    country: 'Canada',
    postalCode: 'A1B 2C3',
    streetAddress: '555 University street',
  };
}

function getRandomInfo() {
  return {
    firstName: 'Bashar',
    googleEmail: 'bashar@gmail.com',
    displayName: 'Bashar Allabadi',
    institutionEmail: 'bashar@oicr.on.ca',
    website: 'http://www.oicr.on.ca',
    lastName: 'Allabadi',
    middleName: 'ali',
    positionTitle: 'Software developer',
    primaryAffiliation: 'OICR',
    suffix: 'suffix',
    title: 'title',
  };
}
