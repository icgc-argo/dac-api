import { Application } from '../domain/interface';
import {
  actionGetStarted,
  compose,
  formatDate,
  getApplicantName,
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
  letterInfo: {
    addedOn: Date;
  },
  uiLinksInfo: UILinksInfo,
) {
  const emailMjml = compose(
    {
      message: messageBody(app, uiLinksInfo, letterInfo),
      receiver: {
        first: reviewerInfo.firstName,
        last: reviewerInfo.lastName,
      },
      includeClosure: false,
    },
    'A New Ethics Letter has been Added',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application, uiLinksInfo: UILinksInfo, letterInfo: { addedOn: Date }) {
  const linkTemplate = `${uiLinksInfo.baseUrl}${uiLinksInfo.pathTemplate}`;
  const link = linkTemplate.replace(`{id}`, app.appId).replace('{section}', 'ethicsLetter');
  return `
    ${textParagraphSection(`A new ethics letter has been added to the following application:`, {
      padding: '0px 0px 5px 0px',
    })}
    ${ethicsInfoBox(app, letterInfo.addedOn)}
    ${actionGetStarted(`Get Started:`, `REVIEW THE ETHICS LETTER`, link)}
  `;
}

function ethicsInfoBox(app: Application, addedOn: Date) {
  return infoBox(app, [
    {
      label: 'Application #',
      value: app.appId,
    },
    {
      label: 'Applicant',
      value: getApplicantName(app.sections.applicant.info),
    },
    {
      label: 'Institution',
      value: app.sections.applicant.info.primaryAffiliation,
    },
    {
      label: 'Added on',
      value: formatDate(addedOn),
    },
  ]);
}
