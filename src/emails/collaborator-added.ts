import moment from 'moment';
import { Application, PersonalInfo } from '../domain/interface';
import {
  actionGetStarted,
  compose,
  formatDate,
  getApplicantName as formatName,
  infoBox,
  textParagraphSection,
  UILinksInfo,
} from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (
  app: Application,
  reviewerInfo: {
    firstName: string;
    lastName: string;
  },
  collaborator: {
    info: PersonalInfo;
    addedOn: Date;
  },
  uiLinksInfo: UILinksInfo,
) {
  const emailMjml = compose(
    {
      message: messageBody(app, uiLinksInfo, formatName(collaborator.info), collaborator.addedOn),
      receiver: {
        first: reviewerInfo.firstName,
        last: reviewerInfo.lastName,
      },
      includeClosure: false,
    },
    'A New Collaborator has been Added',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application, uiLinksInfo: UILinksInfo, name: string, addedOn: Date) {
  const linkTemplate = `${uiLinksInfo.baseUrl}${uiLinksInfo.pathTemplate}`;
  const link = linkTemplate.replace(`{id}`, app.appId).replace('{section}', 'collaborators');
  return `
    ${textParagraphSection(`A new collaborator was added to the following application:`, {
      padding: '0px 0px 5px 0px',
    })}
    ${collaboratorInfoBox(app, name, addedOn)}
    ${actionGetStarted(`Get Started:`, `REVIEW THE COLLABORATOR`, link)}
  `;
}

function collaboratorInfoBox(app: Application, name: string, addedOn: Date) {
  return infoBox(app, [
    {
      label: 'Application #',
      value: app.appId,
    },
    {
      label: 'Applicant',
      value: formatName(app.sections.applicant.info),
    },
    {
      label: 'Institution',
      value: app.sections.applicant.info.primaryAffiliation,
    },
    {
      label: 'Collaborator',
      value: name,
    },
    {
      label: 'Added on',
      value: formatDate(addedOn),
    },
  ]);
}
