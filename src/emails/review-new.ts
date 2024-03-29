import { getAppConfig } from '../config';
import { Application } from '../domain/interface';
import { actionGetStarted, appInfoBox, compose, textParagraphSection, UILinksInfo } from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (app: Application) {
  const config = getAppConfig();
  const reviewerInfo = {
    firstName: config.email.reviewerFirstName,
    lastName: config.email.reviewerLastName,
  };
  const uiLinksInfo = {
    baseUrl: config.ui.baseUrl,
    pathTemplate: config.ui.sectionPath,
  };
  const emailMjml = compose(
    {
      message: messageBody(app, uiLinksInfo),
      receiver: {
        first: reviewerInfo.firstName,
        last: reviewerInfo.lastName,
      },
      includeClosure: false,
    },
    'A New Application has been Submitted',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application, uiLinksInfo: UILinksInfo) {
  const linkTemplate = `${uiLinksInfo.baseUrl}${uiLinksInfo.pathTemplate}`;
  const link = linkTemplate.replace(`{id}`, app.appId).replace('{section}', 'terms');
  return `
    ${textParagraphSection(`A new application has been submitted for your review.`, {
      padding: '0px 0px 5px 0px',
    })}
    ${appInfoBox(app)}
    ${actionGetStarted(`Get Started:`, `REVIEW THE APPLICATION`, link)}
  `;
}
