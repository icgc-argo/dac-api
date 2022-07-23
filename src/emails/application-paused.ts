import { AppConfig } from '../config';
import { Application } from '../domain/interface';
import {
  actionGetStarted,
  appInfoBox,
  compose,
  textParagraphSection,
  UILinksInfo,
  approvalDetailsContent,
  formatDate,
} from './common';
import { compileMjmlInPromise } from './mjml';
import { getAttestationByDate } from '../utils/calculations';

export default async function (app: Application, uiLinksInfo: UILinksInfo, config: AppConfig) {
  const info = app.sections.applicant.info;
  const emailMjml = compose(
    {
      message: messageBody(app, uiLinksInfo, config),
      receiver: {
        first: info.firstName,
        last: info.lastName,
        suffix: info.suffix,
        title: info.title,
      },
      closureData: {
        guideLink: config.email.links.attestationGuide,
        guideText: 'Help Guides for Annual Attestation',
      },
    },
    'Your Access to ICGC Controlled Data has been Paused',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application, uiLinksInfo: UILinksInfo, config: AppConfig) {
  const linkTemplate = `${uiLinksInfo.baseUrl}${uiLinksInfo.pathTemplate}`;
  const link = linkTemplate.replace(`{id}`, app.appId).replace('{section}', 'terms');
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
      label: 'Access Paused on',
      value: formatDate(getAttestationByDate(app.approvedAtUtc, config)),
    },
  ];

  return `
    ${textParagraphSection(
      `<strong>Access to ICGC Controlled Data has been paused</strong> for the following project team until an annual attestation has been completed.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${approvalDetailsContent(attestationData, 'Project access and attestation details:')}
    ${textParagraphSection(
      `Access to ICGC Controlled Data will resume for your project team once you log in and complete the annual attestation for this application.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${actionGetStarted(`Get Started:`, `COMPLETE ATTESTATION`, link)}
  `;
}
