import { AppConfig } from '../config';
import { Application } from '../domain/interface';
import {
  actionGetStarted,
  appInfoBox,
  approvalDetailsContent,
  compose,
  formatDate,
  textParagraphSection,
  UILinksInfo,
} from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (
  app: Application,
  linksConfigs: AppConfig['email']['links'],
  uiLinksInfo: UILinksInfo,
  durationConfigs: AppConfig['durations'],
) {
  const info = app.sections.applicant.info;
  const emailMjml = compose(
    {
      message: messageBody(app, uiLinksInfo, durationConfigs, linksConfigs.dacoSurvey),
      receiver: {
        first: info.firstName,
        last: info.lastName,
        suffix: info.suffix,
        title: info.title,
      },
      closureData: {
        guideLink: linksConfigs.accessRenewalGuide,
        guideText: 'Help Guides for Access Renewal',
      },
    },
    `Your Access to ICGC Controlled Data has Expired`,
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(
  app: Application,
  uiLinksInfo: UILinksInfo,
  durationConfigs: AppConfig['durations'],
  surveyUrl: string,
) {
  const linkTemplate = `${uiLinksInfo.baseUrl}${uiLinksInfo.pathTemplate}`;
  const link = linkTemplate.replace(`{id}`, app.appId).replace('{section}', 'terms');
  const daysLeftForRenewal = durationConfigs.expiry.daysPostExpiry;
  const expiryData = [
    {
      label: 'Title of Project',
      value: app.sections.projectInfo.title,
    },
    {
      label: 'Access Email',
      value: app.sections.applicant.info.googleEmail,
    },
    {
      label: 'Access Expired on',
      value: formatDate(app.expiresAtUtc),
    },
  ];
  return `
    ${textParagraphSection(
      `Access to ICGC Controlled Data has expired for the following project team. Kindly note, it may take up to 24 hours for this status change to take effect.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${approvalDetailsContent(expiryData, 'Access has expired for:')}
    ${textParagraphSection(
      `You have <strong>${daysLeftForRenewal} days to renew</strong> your project team’s access privileges for another two years.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(
      `Once you begin the renewal process, the application will be unlocked for edits. You will be required to review and agree to all Data Access policies again before signing and resubmitting.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${actionGetStarted(`Get Started:`, `RENEW YOUR ACCESS`, link)}
    ${textParagraphSection(
      `You are required to complete a final report as per the conditions of the Data Access Agreement. <a href="${surveyUrl}">Click here to fill out the report</a>, describing your successes and challenges with accessing ICGC Controlled Data and the outcomes of your research project.`,
      { padding: '20px 0px 0px 0px' },
    )}
  `;
}
