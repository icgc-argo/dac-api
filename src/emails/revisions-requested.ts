import mjml2html from 'mjml';
import { AppConfig } from '../config';
import { Application, RevisionRequest } from '../domain/interface';
import { actionGetStarted, appInfoBox, compose, textParagraphSection, UILinksInfo } from './common';
import { compileMjmlInPromise } from './mjml';

export default async function (app: Application, config: AppConfig) {
  const info = app.sections.applicant.info;
  const emailMjml = compose(
    {
      message: messageBody(app, {
        baseUrl: config.ui.baseUrl,
        pathTemplate: config.ui.sectionPath,
      }),
      receiver: {
        first: info.firstName,
        last: info.lastName,
        suffix: info.suffix,
        title: info.title,
      },
      closureData: {
        guideLink: config.email.links.revisionsRequestedGuide,
        guideText: 'Help Guides for Requested Revisions',
      },
    },
    'Your Application has been Reopened for Revisions',
  );

  const htmlOutput = await compileMjmlInPromise(emailMjml);
  if (htmlOutput.errors.length > 0) {
    console.error(`template errors ${JSON.stringify(htmlOutput.errors)}`);
    throw new Error('failed to generate email');
  }
  return { html: htmlOutput.html, emailMjml };
}

function messageBody(app: Application, uiLinksInfo: UILinksInfo) {
  const linkTemplate = `${uiLinksInfo.baseUrl}${uiLinksInfo.pathTemplate}`;
  let firstRevisionSection = '';
  Object.keys(app.revisionRequest).forEach((k) => {
    if (
      !firstRevisionSection &&
      app.revisionRequest[k as keyof Application['revisionRequest']].requested
    ) {
      firstRevisionSection = k;
    }
  });
  const link = linkTemplate.replace(`{id}`, app.appId).replace('{section}', firstRevisionSection);
  return `
    ${textParagraphSection(
      `The Data Access Compliance Office (DACO) has reviewed your Application for Access to ICGC Controlled Data.`,
      { padding: '0px 0px 20px 0px' },
    )}
    ${appInfoBox(app)}
    ${textParagraphSection(
      `<strong>Your application requires revisions</strong> before granting your project team access to ICGC Controlled Data. Please revise the following:`,
      { padding: '0px 0px 10px 0px' },
    )}
    ${revisionTable(app)}
    ${actionGetStarted(`Get Started:`, `REVISE YOUR APPLICATION`, link)}
  `;
}

function revisionTable(app: Application) {
  return `
  <mj-section padding="0px 0px 20px 0px">
    <mj-column border="0px #dcdde1 solid" padding="0" >
      <mj-table font-weight="400"
                font-size="12px"
                color="#000000"
                padding="0px 0px"
                line-height="16px" >
                <tr>
                  <td class="revisions-tbl-header" style="width:185px">Application Section</td>
                  <td class="revisions-tbl-header" style="width:354px">Requested Revisions</td>
                </tr>
                ${Object.keys(app.revisionRequest)
                  .map((r: string) => {
                    const sectionName = r as keyof Application['revisionRequest'];
                    if (
                      app.revisionRequest[sectionName].requested == false ||
                      sectionName == 'general'
                    )
                      return;
                    return revisionSectionRow(sectionName, app.revisionRequest[sectionName]);
                  })
                  .join(`\n`)}
                ${renderGeneralCommentsRow(app)}

      </mj-table>
    </mj-column>
  </mj-section>
  `;
}

function renderGeneralCommentsRow(app: Application) {
  if (!app.revisionRequest.general.requested) return ``;
  return `
              <tr>
                <td colspan='2' class='revisions-tbl-cell'><span style='font-weight:600'>General Comments:</span> ${app.revisionRequest.general.details}</td>
              </tr>
  `;
}

function revisionSectionRow(
  section: keyof Application['revisionRequest'],
  revision: RevisionRequest,
) {
  return `
              <tr>
                <td class='revisions-tbl-cell' style='font-weight:600'>
                  ${getSectionName(section)}
                </td>
                <td class='revisions-tbl-cell'>
                  ${revision.details}
                </td>
              </tr>
  `;
}

function getSectionName(section: keyof Application['revisionRequest']) {
  switch (section) {
    case 'applicant':
      return 'A. Applicant Information';
    case 'representative':
      return 'B. Institutional Representative';
    case 'collaborators':
      return 'C. Collaborators';
    case 'projectInfo':
      return 'D. Project Information';
    case 'ethicsLetter':
      return 'E. Ethics';
    case 'signature':
      return 'Signature';
    case 'general':
      return 'General Comments';
  }
}
