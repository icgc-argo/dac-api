import {
  ICGC_25K_URL,
  ICGC_ARGO_URL,
  ICGC_ARGO_PLATFORM_URL,
  DATA_ACCESS_POLICY_URL,
  ICGC_ARGO_CONTACT_URL,
} from '../utils/constants';
import { AppConfig } from '../config';
import { Application, Collaborator, PersonalInfo } from '../domain/interface';
import { appInfoBox, approvalDetailsBox, approvalDetailsContent, compose, formatDate, textParagraphSection } from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (
  app: Application,
  linksConfigs: AppConfig['email']['links'],

) {
  const applicantInfo = app.sections.applicant.info;
  const emailMjml = compose(
    {
      message: messageBody(app, applicantInfo, linksConfigs.dacoSurvey),
      receiver: {
        first: applicantInfo.firstName,
        last: applicantInfo.lastName,
        suffix: applicantInfo.suffix,
        title: applicantInfo.title,
      },
      includeClosure: false,
    },
    'Your Access to ICGC Controlled Data has been Removed',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application, recipient: PersonalInfo, surveyUrl: string) {
  const removalData = [
    {
      label: 'Title of Project',
      value: app.sections.projectInfo.title,
    },
    {
      label: 'Access Email',
      value: recipient.googleEmail,
    },
    {
      label: 'Access Expired on',
      value: formatDate(app.closedAtUtc || new Date()),
    },
  ];
  return `
    ${textParagraphSection(
      `The following application has been closed and <strong>Access to ICGC Controlled Data has been removed for the following project team</strong>. Kindly note, it may take up to 24 hours for this status change to take effect.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${approvalDetailsContent(removalData, false)}
    ${textParagraphSection(
      `If you did not close this application and you have questions about the reason for this action, please <a href="${ICGC_ARGO_CONTACT_URL}">contact the ICGC DACO team</a>. `,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(
      `We would appreciate any feedback on your successes and challenges with accessing ICGC Controlled Data and the outcomes of your research project. Please take a moment to <a href="${surveyUrl}">fill out this short feedback survey</a>.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(
      `Thank you for your interest in the International Cancer Genome Consortium. `,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(
      `Sincerely, <br />
      The <a href="https://daco.icgc-argo.org/">ICGC DACO</a> Team`,
      { padding: '0px 0px 0px 0px' },
    )}
  `;
}
