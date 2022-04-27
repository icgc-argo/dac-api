import {
  ICGC_25K_URL,
  ICGC_ARGO_URL,
  ICGC_ARGO_PLATFORM_URL,
  DATA_ACCESS_POLICY_URL,
} from '../utils/constants';
import { AppConfig } from '../config';
import { Application, Collaborator, PersonalInfo } from '../domain/interface';
import { appInfoBox, approvalDetailsBox, compose, textParagraphSection } from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (
  app: Application,
  collaborator: Collaborator,
  linksConfigs: AppConfig['email']['links'],
) {
  const info = collaborator.info;
  const emailMjml = compose(
    {
      message: messageBody(app, info),
      receiver: {
        first: info.firstName,
        last: info.lastName,
        suffix: info.suffix,
        title: info.title,
      },
      closureData: {
        guideLink: linksConfigs.dataAccessGuide,
        guideText: 'Help Guides for Accessing Controlled Data',
      },
    },
    'You have been Granted Access',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application, recipient: PersonalInfo) {
  return `
    ${textParagraphSection(
      `You have been granted access to ICGC Controlled Data, as requested by the Principal Investigator of your project on the following application.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${approvalDetailsBox(app, recipient.googleEmail, 'The following are your access details:')}
    ${textParagraphSection(
      `Please note that access to ICGC Controlled Data remains conditional upon respecting the terms and conditions of the Data Access Agreement, particularly regarding (but not limited to) the publication moratorium and re-identification of research participants.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(
      `The length of the access period is two years starting from the date of approval. At the end of the 2-year period, your Principal Investigator can renew your access.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${textParagraphSection(`Next Steps:`, { padding: '0px 0px 2px 0px', 'font-weight': 'bold' })}
    ${bulletPoints()}
  `;
}

function bulletPoints() {
  return `
  <mj-section padding="0">
    <mj-column padding="0">
      <mj-raw>
        <ol style="padding:0 0 0 19; font-family: 'Work Sans', Helvetica, Arial, sans-serif; font-size: 14px;font-weight:400;line-height:24px;color:#000">
          <li style="padding-left: 10px; margin-bottom: 20px">
            Review all <a href="${DATA_ACCESS_POLICY_URL}">Data Access Policies</a> and should you have any questions, please contact your Principal Investigator.
          </li>
          <li style="padding-left: 10px; margin-bottom: 20px">
            You can access ICGC Controlled Data in the following data portals:
            <ol style="padding:0px 0px 0px 15px">
              <li style="list-style-type:lower-alpha">
                <a style="font-weight:600" href="${ICGC_ARGO_PLATFORM_URL}">ICGC ARGO Data Platform</a> - If you have never logged in to the ARGO Data Platform, <a style="font-weight:600" href="${ICGC_ARGO_PLATFORM_URL}">please log in now to initialize your account</a>. Access to ICGC ARGO Controlled Data will  be authorized within 24 hours after your account is initialized.
              </li>
              <li style="list-style-type:lower-alpha">
                <a style="font-weight:600" href="${ICGC_25K_URL}"> ICGC 25K Data Portal</a> - Access to ICGC 25K Controlled Data will be authorized within 24 hours after DACO approval.
              </li>
            </ol>
          </li>
          <li style="padding-left: 10px">
            Visit <a href=${ICGC_ARGO_URL}>icgc-argo.org</a> for updated news about the ICGC ARGO project.
          </li>
        </ol>
      </mj-raw>
    </mj-column>
  </mj-section>
  `;
}
