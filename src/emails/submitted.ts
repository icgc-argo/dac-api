import mjml2html from 'mjml';
import { AppConfig } from '../config';
import { Application } from '../domain/interface';
import { appInfoBox, compose, textParagraphSection } from './common';
import { compileMjmlInPromise } from './mjml';


export default async function(app: Application, linksConfigs: AppConfig['email']['links']) {
  const info = app.sections.applicant.info;
  const emailMjml = compose({
    message: messageBody(app),
    receiver: {
      first: info.firstName,
      last: info.lastName,
      suffix: info.suffix,
      title: info.title,
    },
    closureData: {
      guideLink: linksConfigs.reviewGuide,
      guideText: 'Help Guides for ICGC DACO Review'
    }
  }, 'We have Received your Application');

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application) {
  return  `
    ${textParagraphSection(`The Data Access Compliance Office (DACO) has received your Application for Access to ICGC Controlled Data.`, { padding: '0px 0px 20px 0px' })}
    ${appInfoBox(app)}
    ${textParagraphSection(`Your application is currently locked and not editable online. The ICGC DACO will review your application in the next ten (10) business days and you should hear back in due course.`)}
  `;
}