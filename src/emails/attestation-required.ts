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
    'An Annual Attestation is Required',
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
      label: 'Annual Attestation Due',
      value: formatDate(getAttestationByDate(app.approvedAtUtc)),
    },
  ];

  return `
    ${textParagraphSection(
      `ICGC recognizes the importance of ensuring compliance to data access policies including, but not limited to, policies concerning the security of the donors' data.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(
      `Therefore, <strong>an annual attestation is required</strong> for the following project team.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${approvalDetailsContent(attestationData, 'Project access and attestation details:', 170)}
    ${textParagraphSection(
      `You have <strong>${config.durations.attestation.daysToAttestation} days to log in and complete an attestation for this project</strong>. If you do not complete the attestation by the due date noted above, access to ICGC Controlled Data will be paused for your project team.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${actionGetStarted(`Get Started:`, `COMPLETE ATTESTATION`, link)}
  `;
}
