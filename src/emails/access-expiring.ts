import { AppConfig } from '../config';
import { Application } from '../domain/interface';
import {
  actionGetStarted,
  appInfoBox,
  accessDetailsBox,
  compose,
  textParagraphSection,
  UILinksInfo,
} from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (
  app: Application,
  linksConfigs: AppConfig['email']['links'],
  uiLinksInfo: UILinksInfo,
  durationConfigs: AppConfig['durations'],
  daysToExpiry: number,
) {
  const info = app.sections.applicant.info;
  const emailMjml = compose(
    {
      message: messageBody(app, uiLinksInfo, durationConfigs, daysToExpiry),
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
    `Your Access is Expiring in ${daysToExpiry} days`,
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
  daysToExpiry: number,
) {
  const linkTemplate = `${uiLinksInfo.baseUrl}${uiLinksInfo.pathTemplate}`;
  const link = linkTemplate.replace(`{id}`, app.appId).replace('{section}', 'terms');
  const daysLeftForRenewal = daysToExpiry + durationConfigs.expiry.daysPostExpiry;
  return `
    ${textParagraphSection(
      `<strong>The following application is expiring in ${daysToExpiry} days.</strong> On the date of expiry, all project members will lose access to ICGC Controlled Data.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${accessDetailsBox(
      app,
      app.sections.applicant.info.googleEmail,
      'The following are your access details:',
    )}
    ${textParagraphSection(
      `You have <strong>${daysLeftForRenewal} days to renew</strong> your project team’s access privileges for another two years.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(
      `Once you begin the renewal process, the application will be unlocked for edits. You will be required to review and agree to all Data Access policies again before signing and resubmitting.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${actionGetStarted(`Get Started:`, `RENEW YOUR ACCESS`, link)}
  `;
}
