import { AppConfig } from '../config';
import { Application, PersonalInfo } from '../domain/interface';
import { appInfoBox, approvalDetailsBox, compose, textParagraphSection } from './common';
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
      guideLink: linksConfigs.dataAccessGuide,
      guideText: 'Help Guides for Accessing Controlled Data'
    }
  }, 'Your Application has been Approved!');

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application) {
  return  `
    ${textParagraphSection(`Based upon the information provided in the following application, you have been granted access to ICGC Controlled Data for 2 years. <strong>Kindly note, it may take up to 24 hours for authorization to take effect.</strong>`, { padding: '0px 0px 20px 0px' })}
    ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
    ${approvalDetailsBox(app, app.sections.applicant.info.googleEmail)}
    ${textParagraphSection(`Please note that access to ICGC Controlled Data remains conditional upon respecting the terms and conditions of the <a href="#">Data Access Agreement</a>, particularly regarding (but not limited to) the publication moratorium and re-identification of research participants.`, { padding: '0px 0px 20px 0px' })}
    ${textParagraphSection(`The length of the access period is two years starting from the date of approval. At the end of the 2-years period, you can extend your access privilege for another 2 years by completing the renewal process.`, { padding: '0px 0px 20px 0px' })}
    ${textParagraphSection(`Next Steps:`, {  padding: '0px 0px 2px 0px', 'font-weight': 'bold'  })}
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
            A copy of the application signed by the Data Access Officer will be sent to you shortly.
          </li>
          <li style="padding-left: 10px; margin-bottom: 20px">
            You can access ICGC Controlled Data in the following data portals:
            <ul style="padding:0 0 0 15">
              <li style="list-style-type: disc">
                <a href="https://platform.icgc-argo.org/">ICGC ARGO Data Platform</a>
              </li>
              <li style="list-style-type: disc">
                <a href="https://dcc.icgc.org/"> ICGC 25K Data Portal</a>
              </li>
            </ul>
          </li>
          <li style="padding-left: 10px">
            Visit <a href="https://www.icgc-argo.org">icgc-argo.org</a> for updated news about the ICGC ARGO project.
          </li>
        </ol>
      </mj-raw>
    </mj-column>
  </mj-section>
  `;
}