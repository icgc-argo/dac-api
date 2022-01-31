import { ICGC_ARGO_CONTACT_URL, ICGC_DACO_URL } from '../utils/constants';
import { AppConfig } from '../config';
import { Application, Collaborator, PersonalInfo } from '../domain/interface';
import {
  appInfoBox,
  approvalDetailsContent,
  compose,
  defaultTextStyle,
  formatDate,
  text,
  textParagraphSection,
} from './common';
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

function messageBody(app: Application, recipient: PersonalInfo) {
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
      label: 'Access Removed on',
      value: formatDate(app.lastUpdatedAtUtc || new Date()), // what value would this be
    },
  ];
  return `
      ${textParagraphSection(
        `This automated message is to inform you that your <strong>Access to ICGC Controlled Data has been removed for the following project team</strong>. Kindly note, it may take up to 24 hours for this status change to take effect.`,
        { padding: '0px 0px 20px 0px' },
      )}
      ${appInfoBox(app, 'Approved on', app.approvedAtUtc, false)}
      ${approvalDetailsContent(removalData)}
      <mj-section padding="0">
      <mj-column padding="0">
        ${text(
          `If you have any questions, please contact the Principal Investigator of your project, or <a href="${ICGC_ARGO_CONTACT_URL}">contact the ICGC DACO team</a>.`,
          { ...defaultTextStyle, padding: '20px 0px 0px 0px' },
        )}
        ${text(`Thank you for your interest in the International Cancer Genome Consortium.`, {
          ...defaultTextStyle,
          padding: '20px 0px 0px 0px',
        })}
        ${text(
          `Sincerely, <br />
          The <a href="${ICGC_DACO_URL}">ICGC DACO</a> Team`,
          { ...defaultTextStyle, padding: '20px 0px 0px 0px' },
        )}
      </mj-column>
    </mj-section>
    `;
}
