import mjml2html from 'mjml';
import { AppConfig } from '../config';
import { Application } from '../domain/interface';
import { appInfoBox, compose, text, textParagraphSection } from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (app: Application, linksConfigs: AppConfig['email']['links']) {
  const info = app.sections.applicant.info;
  const emailMjml = compose(
    {
      message: messageBody(app),
      receiver: {
        first: info.firstName,
        last: info.lastName,
        suffix: info.suffix,
        title: info.title,
      },
      closureData: {
        guideLink: linksConfigs.approvalGuide,
        guideText: 'Help Guides',
      },
    },
    'Your Application has been Rejected',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application) {
  return `
    ${textParagraphSection(
      `The Data Access Compliance Office (DACO) has received your Application for Access to ICGC Controlled Data.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app)}
    ${textParagraphSection(
      `Because your application does not meet substantive criteria set out by ICGC to access the controlled data of the Consortium, we regret to inform you that we cannot grant you access privileges at this point in time. Your application has been closed and cannot be reopened.`
      , { padding: '0px 0px 20px 0px' })}
    ${
       app.denialReason ? rejectionReasonBox(`<strong>Details from the ICGC DACO Team:</strong> ${app.denialReason}`) : ''
     }
  `;
}


export function rejectionReasonBox(
  content: string,
) {
  return `
    <mj-section padding="0" >
      <mj-column padding="0" border="1px #dcdde1 solid" >
        ${text(content, { padding: '12px' })}
      </mj-column>
    </mj-section>
  `;
}