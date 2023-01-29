/*
 * Copyright (c) 2022 The Ontario Institute for Cancer Research. All rights reserved
 *
 * This program and the accompanying materials are made available under the terms of
 * the GNU Affero General Public License v3.0. You should have received a copy of the
 * GNU Affero General Public License along with this program.
 *  If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { Attachment } from 'nodemailer/lib/mailer';
import nodemail from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import { AppConfig } from '../../config';
import { wasInRevisionRequestState } from '../state';
import { Application, Collaborator } from '../interface';
import renderReviewEmail from '../../emails/review-new';
import renderReviewRevisedEmail from '../../emails/review-revised';
import renderEthicsLetterEmail from '../../emails/ethics-letter';
import renderCollaboratorAdded from '../../emails/collaborator-added';

import renderSubmittedEmail from '../../emails/submitted';
import renderRevisionsEmail from '../../emails/revisions-requested';
import renderApprovedEmail from '../../emails/application-approved';
import renderCollaboratorNotificationEmail from '../../emails/collaborator-notification';
import renderCollaboratorRemovedEmail from '../../emails/collaborator-removed';
import renderApplicationClosedEmail from '../../emails/closed-approved';
import renderRejectedEmail from '../../emails/rejected';
import renderAccessExpiringEmail from '../../emails/access-expiring';
import renderAccessHasExpiredEmail from '../../emails/access-has-expired';
import renderAttestationRequiredEmail from '../../emails/attestation-required';
import renderApplicationPausedEmail from '../../emails/application-paused';
import renderAttestationReceivedEmail from '../../emails/attestation-received';
import renderReviewRenewalEmail from '../../emails/review-renewal';

function getApplicantEmails(app: Application) {
  return new Set([
    app.submitterEmail,
    app.sections.applicant.info.googleEmail,
    app.sections.applicant.info.institutionEmail,
  ]);
}

export async function sendEmail(
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  fromEmail: string,
  fromName: string,
  to: Set<string>,
  subject: string,
  html: string,
  bcc?: Set<string>,
  attachments?: Attachment[],
): Promise<void> {
  const info = await emailClient.sendMail({
    from: `"${fromName}" <${fromEmail}>`, // sender address
    to: Array.from(to).join(','), // list of receivers
    subject: subject, // Subject line
    html: html, // html body
    ...(bcc && { bcc: Array.from(bcc).join(',') }), // bcc address
    ...(attachments && { attachments }),
  });
}

export async function sendSubmissionConfirmation(
  updatedApp: Application,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) {
  const submittedEmail = await renderSubmittedEmail(updatedApp, config.email.links);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    `[${updatedApp.appId}] We Received your Application`,
    submittedEmail.html,
  );
}

export async function sendRejectedEmail(
  updatedApp: Application,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) {
  const submittedEmail = await renderRejectedEmail(updatedApp, config.email.links);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    `[${updatedApp.appId}] Your Application has been Rejected`,
    submittedEmail.html,
    new Set([config.email.dacoAddress]),
  );
}

export async function sendRevisionsRequestEmail(
  app: Application,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) {
  const submittedEmail = await renderRevisionsEmail(app, config);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(app),
    `[${app.appId}] Your Application has been Reopened for Revisions`,
    submittedEmail.html,
    new Set([config.email.dacoAddress]),
  );
}

export async function sendApplicationApprovedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const email = await renderApprovedEmail(updatedApp, config.email.links);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    `[${updatedApp.appId}] Your Application has been Approved`,
    email.html,
    new Set([config.email.dacoAddress]),
  );
}

export async function sendCollaboratorAddedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const collaborators = updatedApp.sections.collaborators.list;
  const reviewEmail = await renderCollaboratorAdded(
    updatedApp,
    {
      firstName: config.email.reviewerFirstName,
      lastName: config.email.reviewerLastName,
    },
    {
      info: collaborators[collaborators.length - 1].info,
      addedOn: new Date(),
    },
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
  );
  const emailContent = reviewEmail.html;
  const title = `A New Collaborator has been Added`;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([config.email.dacoAddress]),
    subject,
    emailContent,
  );
}

export async function sendCollaboratorApprovedEmail(
  updatedApp: Application,
  collaborator: Collaborator,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const collaboratorApprovedEmail = await renderCollaboratorNotificationEmail(
    updatedApp,
    collaborator,
    config.email.links,
  );
  const emailContent = collaboratorApprovedEmail.html;
  const title = `You have been Granted Access`;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([collaborator.info.googleEmail, collaborator.info.institutionEmail]),
    subject,
    emailContent,
  );
}

export async function sendCollaboratorRemovedEmail(
  updatedApp: Application,
  collaborator: Collaborator,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const collaboratorRemovedEmail = await renderCollaboratorRemovedEmail(
    updatedApp,
    collaborator,
    config.email.links,
  );
  const emailContent = collaboratorRemovedEmail.html;
  const title = `Your Access to ICGC Controlled Data has been Removed`;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([collaborator.info.googleEmail, collaborator.info.institutionEmail]),
    subject,
    emailContent,
  );
}

export async function sendEthicsLetterSubmitted(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const ethicLetters = updatedApp.sections.ethicsLetter.approvalLetterDocs;
  const reviewEmail = await renderEthicsLetterEmail(
    updatedApp,
    {
      firstName: config.email.reviewerFirstName,
      lastName: config.email.reviewerLastName,
    },
    {
      addedOn: ethicLetters[ethicLetters.length - 1].uploadedAtUtc,
    },
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
  );
  const emailContent = reviewEmail.html;
  const title = `A New Ethics Letter has been Added`;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([config.email.dacoAddress]),
    subject,
    emailContent,
  );
}

export async function sendReviewEmail(
  oldApplication: Application,
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  let emailContent: string;
  let title: string;
  if (wasInRevisionRequestState(oldApplication)) {
    // send new app for review email
    const reviewEmail = await renderReviewRevisedEmail(
      updatedApp,
      {
        firstName: config.email.reviewerFirstName,
        lastName: config.email.reviewerLastName,
      },
      {
        baseUrl: config.ui.baseUrl,
        pathTemplate: config.ui.sectionPath,
      },
    );
    emailContent = reviewEmail.html;
    title = `[${updatedApp.appId}] A Revised Application has been Submitted`;
  } else if (oldApplication.isRenewal) {
    // send a renewal for review email
    const reviewEmail = await renderReviewRenewalEmail(
      updatedApp,
      {
        firstName: config.email.reviewerFirstName,
        lastName: config.email.reviewerLastName,
      },
      {
        baseUrl: config.ui.baseUrl,
        pathTemplate: config.ui.sectionPath,
      },
    );
    emailContent = reviewEmail.html;
    title = `[${updatedApp.appId}] A Renewal Application has been Submitted`;
  } else {
    // send new app for review email
    const reviewEmail = await renderReviewEmail(
      updatedApp,
      {
        firstName: config.email.reviewerFirstName,
        lastName: config.email.reviewerLastName,
      },
      {
        baseUrl: config.ui.baseUrl,
        pathTemplate: config.ui.sectionPath,
      },
    );
    emailContent = reviewEmail.html;
    title = `[${updatedApp.appId}] A New Application has been Submitted`;
  }

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([config.email.dacoAddress]),
    title,
    emailContent,
  );
}

export async function sendAttestationRequiredEmail(
  currentApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
): Promise<Application> {
  const title = 'An Annual Attestation is Required';
  const email = await renderAttestationRequiredEmail(
    currentApp,
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
    config,
  );
  const emailContent = email.html;
  const subject = `[${currentApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(currentApp),
    subject,
    emailContent,
  );
  return currentApp;
}

export async function sendApplicationPausedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
): Promise<Application> {
  const title = 'Your Access to ICGC Controlled Data has been Paused';
  const email = await renderApplicationPausedEmail(
    updatedApp,
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
    config,
  );
  const emailContent = email.html;
  const subject = `[${updatedApp.appId}] ${title}`;
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    subject,
    emailContent,
  );
  return updatedApp;
}

export async function sendAttestationReceivedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const title = `We have Received your Annual Attestation`;
  const attestationEmail = await renderAttestationReceivedEmail(updatedApp, config.email.links);
  const emailContent = attestationEmail.html;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    subject,
    emailContent,
    new Set([config.email.dacoAddress]),
  );
}

export async function sendAccessExpiringEmail(
  updatedApp: Application,
  config: AppConfig,
  daysToExpiry: number, // this will come from the cronjob that is executing, i.e. first (90 days) or second (45 days) warning
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const title = `Your Access is Expiring in ${daysToExpiry} days`;
  const notificationEmail = await renderAccessExpiringEmail(
    updatedApp,
    config.email.links,
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
    config.durations,
    daysToExpiry,
  );
  const emailContent = notificationEmail.html;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    subject,
    emailContent,
  );
}

export async function sendAccessHasExpiredEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const title = `Your Access to ICGC Controlled Data has Expired`;
  const notificationEmail = await renderAccessHasExpiredEmail(
    updatedApp,
    config.email.links,
    {
      baseUrl: config.ui.baseUrl,
      pathTemplate: config.ui.sectionPath,
    },
    config.durations,
  );
  const emailContent = notificationEmail.html;
  const subject = `[${updatedApp.appId}] ${title}`;

  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    subject,
    emailContent,
  );
}

export async function sendApplicationClosedEmail(
  updatedApp: Application,
  config: AppConfig,
  emailClient: nodemail.Transporter<SMTPTransport.SentMessageInfo>,
) {
  const email = await renderApplicationClosedEmail(updatedApp, config.email.links);
  await sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    getApplicantEmails(updatedApp),
    `[${updatedApp.appId}] Your Access to ICGC Controlled Data has been Removed`,
    email.html,
    new Set([config.email.dacoAddress]),
  );
}
