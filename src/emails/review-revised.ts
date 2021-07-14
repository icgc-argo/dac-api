import mjml2html from 'mjml';
import { Application } from '../domain/interface';
import { actionGetStarted, appInfoBox, compose, textParagraphSection, UILinksInfo } from './common';
import { compileMjmlInPromise } from './mjml';

export default async function(app: Application,
                        reviewerInfo: {
                          firstName: string;
                          lastName: string;
                        },
                        uiLinksInfo: UILinksInfo) {
  const emailMjml = compose({
    message: messageBody(app, uiLinksInfo),
    receiver: {
      first: reviewerInfo.firstName,
      last: reviewerInfo.lastName,
    },
    includeClousre: false,
  }, 'A Revised Application has been Submitted');

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
  return  `
    ${textParagraphSection(`An application has been revised and submitted for your review.`, { padding: '0px 0px 5px 0px' })}
    ${appInfoBox(app)}
    ${actionGetStarted(`Get Started:`, `REVIEW THE APPLICATION`, link)}
  `;
}

