import { AppConfig } from '../config';
import { Application } from '../domain/interface';
import {
  appInfoBox,
  compose,
  textParagraphSection,
  approvalDetailsContent,
  formatDate,
} from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (app: Application, linksConfig: AppConfig['email']['links']) {
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
        guideLink: linksConfig.generalApplicationGuide,
        guideText: 'Help Guides',
      },
    },
    'We have Received your Annual Attestation',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application) {
  const attestationData = [
    {
      label: 'Title of Project',
      value: app.sections.projectInfo.title,
    },
    {
      label: 'Access Email',
      value: app.sections.applicant.info.googleEmail,
    },
    {
      label: 'Access Expiry Date',
      value: formatDate(app.expiresAtUtc),
    },
    {
      label: 'Attested on',
      value: formatDate(app.attestedAtUtc as Date),
    },
  ];

  return `
    ${textParagraphSection(
      `Thank you for completing the annual attestation for the following project team.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${approvalDetailsContent(attestationData, 'The following are your access details:')}
    ${textParagraphSection(
      `Your project team will continue to have access to ICGC Controlled Data until the access expiry date noted above.`,
      { padding: '0px 0px 20px 0px' },
    )}
  `;
}
