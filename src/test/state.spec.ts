import { Identity } from '@overture-stack/ego-token-middleware';
import { Address, Application, Collaborator, TERMS_AGREEMENT_NAME, UpdateApplication } from '../domain/interface';
import { ApplicationStateManager, newApplication } from '../domain/state';
import { expect } from 'chai';
import _ from 'lodash';
import { BadRequest } from '../utils/errors';

const newApplication1: Partial<Application> = newApplication({
  userId: 'abc123',
  tokenInfo: {
    context: {
      user: {
        email: 'test@example.com'
      }
    }
  }
} as Identity);


describe('state manager', () => {
  it('should update terms application', () => {
    const emptyApp: Application = _.cloneDeep({ ...newApplication1, appId: 'DACO-1', appNumber: 1 }) as Application;
    const state = new ApplicationStateManager(emptyApp);
    const terms = {
      agreement: {
        name: TERMS_AGREEMENT_NAME,
        accepted: true
      }
    } as any;

    const result = state.updateApp({
      sections: {
        terms,

      }
    }, false);

    expect(result.sections.terms.agreement.accepted).to.eq(true);
    expect(result.sections.terms.meta.status).to.eq('COMPLETE');
  });

  it('should update applicant info', () => {
    const emptyApp: Application = _.cloneDeep({ ...newApplication1, appId: 'DACO-1', appNumber: 1 }) as Application;
    const state = new ApplicationStateManager(emptyApp);
    const updatePart: Partial<UpdateApplication> = {
      sections: {
        applicant: {
          info: {
            firstName: 'Bashar',
            lastName: 'Allabadi',
            googleEmail: 'bashar@example.com',
            primaryAffiliation: 'OICR'
          }
        }
      }
    };

    const result = state.updateApp(updatePart, false);
    expect(result.sections.applicant.info).to.include(updatePart.sections?.applicant?.info);
  });

  it('should add collaborator', () => {
    const emptyApp: Application = _.cloneDeep({ ...newApplication1, appId: 'DACO-1', appNumber: 1 }) as Application;
    const state = new ApplicationStateManager(emptyApp);
    const collab: Collaborator = {
      meta: {
        errorsList: [],
        status: 'COMPLETE'
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
        institutionWebsite: ''
      },
      type: 'personnel'
    };

    const result = state.addCollaborator(collab);
    expect(result.sections.collaborators.list[0]).to.include(collab);
    expect(result.sections.collaborators.list[0].id).to.not.be.empty;
    expect(result.sections.collaborators.meta.status).to.eq('COMPLETE');
  });

  it('should check collaborator primary affiliation', () => {
    const emptyApp: Application = _.cloneDeep({ ...newApplication1, appId: 'DACO-1', appNumber: 1 }) as Application;
    emptyApp.sections.applicant.info.primaryAffiliation = 'ACME';
    const state = new ApplicationStateManager(emptyApp);
    const collab: Collaborator = {
      meta: {
        errorsList: [],
        status: 'COMPLETE'
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
        institutionWebsite: ''
      },
      type: 'personnel'
    };

    try {
      state.addCollaborator(collab);
    } catch (e) {
      expect((e as BadRequest).info.errors[0]).to.include({
        'field': 'primaryAffililation',
        'message': 'Primary Affiliation must be the same as the Applicant'
      });
    }
  });

  it('should change to sign & submit', () => {
    const filledApp: Application = _.cloneDeep({ ...newApplication1, appId: 'DACO-1', appNumber: 1 }) as Application;
    filledApp.sections.terms.agreement.accepted = true;
    filledApp.sections.terms.meta.status = 'COMPLETE';

    filledApp.sections.applicant.info = getRandomInfo();
    filledApp.sections.applicant.address = getAddress();
    filledApp.sections.applicant.meta = {
      status: 'COMPLETE',
      errorsList: []
    };

    filledApp.sections.representative.address = getAddress();
    filledApp.sections.representative.info = getRandomInfo();
    filledApp.sections.representative.meta = {
      status: 'COMPLETE',
      errorsList: []
    };

    filledApp.sections.ITAgreements.agreements.forEach(ag => ag.accepted = true);
    filledApp.sections.ITAgreements.meta = {
      status: 'COMPLETE',
      errorsList: []
    };

    filledApp.sections.dataAccessAgreement.agreements.forEach(ag => ag.accepted = true);
    filledApp.sections.dataAccessAgreement.meta = {
      status: 'COMPLETE',
      errorsList: []
    };

    filledApp.sections.appendices.agreements.forEach(ag => ag.accepted = true);
    filledApp.sections.appendices.meta = {
      status: 'COMPLETE',
      errorsList: []
    };

    filledApp.sections.projectInfo.aims = 'paspd apsd ]a]]eromad  lsad lasd llaal  asdld  aslld';
    filledApp.sections.projectInfo.background = 'paspd apsd ]a]]eromad  lsad lasd llaal  asdld  aslld';
    filledApp.sections.projectInfo.methodology = 'paspd apsd ]a]]eromad  lsad lasd llaal  asdld  aslld';
    filledApp.sections.projectInfo.title = 'title title title';
    filledApp.sections.projectInfo.website = 'http://www.website.web';
    filledApp.sections.projectInfo.publicationsURLs = ['http://www.website.web', 'http://abcd.efg.ca', 'http://hijk.lmnop.qrs'];
    filledApp.sections.projectInfo.meta = {
      status: 'COMPLETE',
      errorsList: []
    };

    const state = new ApplicationStateManager(filledApp);
    const updatePart: Partial<UpdateApplication> = {
      sections: {
        ethicsLetter: {
          declaredAsRequired: false
        }
      }
    };

    const result = state.updateApp(updatePart, false);
    expect(result.state).to.eq('SIGN AND SUBMIT');
  });

});


function getAddress(): Address {
  return {
    'building': 'MARS',
    'cityAndProvince': 'Toronto, Ontario',
    'country': 'Canada',
    'postalCode': 'A1B 2C3',
    'streetAddress': '555 University street'
  };
}

function getRandomInfo() {
  return {
    'firstName': 'Bashar',
    'googleEmail': 'bashar@gmail.com',
    'displayName': 'Bashar Allabadi',
    'institutionEmail': 'bashar@oicr.on.ca',
    'institutionWebsite': 'http://www.oicr.on.ca',
    'lastName': 'Allabadi',
    'middleName': 'ali',
    'positionTitle': 'Software developer',
    'primaryAffiliation': 'OICR',
    'suffix': 'suffix',
    'title': 'title'
  };
}