import { Readable } from 'stream';
import JSZip from 'jszip';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import getAppSecrets from '../secrets';
import { sendEmail } from '../domain/service/emails';
import { getAppConfig } from '../config';
import { encrypt } from '../domain/service/encryption';
import { createDacoCSVFile } from '../domain/service/files';
import logger, { buildMessage } from '../logger';
import { JobReport } from './types';

export const JOB_NAME = 'APPROVED USERS EMAIL';

async function runApprovedUsersEmail(
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<JobReport<void>> {
  const jobStartTime = new Date();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    await sendEncryptedApprovedUsersEmail(emailClient, JOB_NAME);
    const endTime = new Date();
    const jobSuccessReport: JobReport<void> = {
      jobName: JOB_NAME,
      startedAt: jobStartTime,
      finishedAt: endTime,
      success: true,
    };
    logger.info(`${JOB_NAME} - Report: ${JSON.stringify(jobSuccessReport)}`);
    return jobSuccessReport;
  } catch (err) {
    logger.error(`${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`);
    const jobEndTime = new Date();
    const jobFailedReport: JobReport<void> = {
      jobName: JOB_NAME,
      startedAt: jobStartTime,
      finishedAt: jobEndTime,
      success: false,
      error: `${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`,
    };
    logger.error(`${JOB_NAME} - Report: ${JSON.stringify(jobFailedReport)}`);
    return jobFailedReport;
  }
}

export const sendEncryptedApprovedUsersEmail = async (
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  jobName: string = '',
): Promise<void> => {
  // generate CSV file from approved users
  const csv = await createDacoCSVFile(jobName);
  // encrypt csv content, return {content, iv}
  const secrets = await getAppSecrets();
  // encrypt the contents
  logger.info(buildMessage(jobName, `Encrypting CSV file...`));
  const encrypted = await encrypt(csv, secrets.auth.dacoEncryptionKey);

  // build streams to zip later
  const ivStream = new Readable();
  ivStream.push(encrypted.iv);
  ivStream.push(null);
  const contentStream = new Readable();
  contentStream.push(encrypted.content);
  contentStream.push(null);

  // build the zip package
  logger.info(buildMessage(jobName, `Creating zip...`));
  const zip = new JSZip();
  const zipName = `icgc_daco_users.zip`;
  [
    { name: 'iv.txt', stream: ivStream },
    { name: 'approved_users.csv.enc', stream: contentStream },
  ].forEach((a) => {
    zip.file(a.name, a.stream);
  });
  logger.info(buildMessage(jobName, `Added CSV data to ${zipName} file.`));
  const zipFileOut = await zip.generateAsync({
    type: 'nodebuffer',
  });

  const config = getAppConfig();
  // send the email
  logger.info(buildMessage(jobName, `Zip complete. Sending email with zip attachment.`));
  sendEmail(
    emailClient,
    config.email.fromAddress,
    config.email.fromName,
    new Set([config.email.dccMailingList]),
    'Approved DACO Users',
    `find the attached zip package`,
    undefined,
    [
      {
        filename: zipName,
        content: zipFileOut,
        contentType: 'application/zip',
      },
    ],
  );
};

export default runApprovedUsersEmail;
