import { Readable } from 'stream';
import JSZip from 'jszip';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

import getAppSecrets from '../secrets';
import { sendEmail } from '../domain/service/emails';
import { getAppConfig } from '../config';
import { encrypt } from '../domain/service/encryption';
import { createDacoCSVFile } from '../domain/service/files';
import logger from '../logger';

// create the csv file
// encrypt the file
// zip the file
// send

export const sendEncryptedApprovedUsersEmail = async (
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<void> => {
  // generate CSV file from approved users
  const csv = await createDacoCSVFile();
  // encrypt csv content, return {content, iv}
  const secrets = await getAppSecrets();
  // encrypt the contents
  const encrypted = await encrypt(csv, secrets.auth.dacoEncryptionKey);

  // build streams to zip later
  const ivStream = new Readable();
  ivStream.push(encrypted.iv);
  // tslint:disable-next-line:no-null-keyword
  ivStream.push(null);
  const contentStream = new Readable();
  contentStream.push(encrypted.content);
  // tslint:disable-next-line:no-null-keyword
  contentStream.push(null);

  // build the zip package
  const zip = new JSZip();
  [
    { name: 'iv.txt', stream: ivStream },
    { name: 'approved_users.csv.enc', stream: contentStream },
  ].forEach((a) => {
    zip.file(a.name, a.stream);
  });
  const zipFileOut = await zip.generateAsync({
    type: 'nodebuffer',
  });
  const zipName = `icgc_daco_users.zip`;

  const config = getAppConfig();
  // send the email
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
