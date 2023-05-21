import { AppConfig } from '../config';
import { Application } from '../domain/interface';
import {
  actionGetStarted,
  appInfoBox,
  accessDetailsBox,
  compose,
  textParagraphSection,
  UILinksInfo,
  TEXT_DISPLAY_DATE,
  formatDate,
} from './common';
import { compileMjmlInPromise } from './mjml';
import { getRenewalPeriodEndDate } from '../utils/calculations';

export default async function (
  app: Application,
  linksConfigs: AppConfig['email']['links'],
  uiLinksInfo: UILinksInfo,
) {
  const info = app.sections.applicant.info;
  const emailMjml = compose(
    {
      message: messageBody(app, uiLinksInfo),
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
    `Your Access is Expiring Soon`,
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('Failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application, uiLinksInfo: UILinksInfo) {
  const linkTemplate = `${uiLinksInfo.baseUrl}${uiLinksInfo.pathTemplate}`;
  const link = linkTemplate.replace(`{id}`, app.appId).replace('{section}', 'terms');
  const renewalPeriodEndDate = getRenewalPeriodEndDate(app.expiresAtUtc);

  return `
    ${textParagraphSection(
      `<strong>The following application is expiring on ${formatDate(
        app.expiresAtUtc,
        TEXT_DISPLAY_DATE,
      )}.</strong> On the date of expiry, all project members will lose access to ICGC Controlled Data.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(
      `You have <strong>until ${formatDate(
        renewalPeriodEndDate,
        TEXT_DISPLAY_DATE,
      )} to complete a renewal</strong> to extend your project team's access privileges for another two years.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${accessDetailsBox(
      app,
      app.sections.applicant.info.googleEmail,
      'The following are your access details:',
    )}
    ${textParagraphSection(
      `If you have not already initiated the renewal process, you can do so from your DACO application.  You will be required to review and agree to all Data Access policies again before signing and resubmitting.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${actionGetStarted(`Get Started:`, `RENEW YOUR ACCESS`, link)}
  `;
}
