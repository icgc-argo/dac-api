import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import moment, { unitOfTime } from 'moment';
import { FilterQuery } from 'mongoose';
import { chunk } from 'lodash';

import logger from '../logger';
import { AppConfig, getAppConfig } from '../config';
import { NOTIFICATION_UNIT_OF_TIME, REQUEST_CHUNK_SIZE } from '../utils/constants';
import { ApplicationDocument, ApplicationModel } from '../domain/model';
import { Application } from '../domain/interface';
import { buildReportItem, getEmptyReport } from './utils';
import { sendAttestationRequiredEmail } from '../domain/service';
import { getDayRange } from '../utils/calculations';

export const JOB_NAME = 'ATTESTATION REQUIRED NOTIFICATIONS';

// Check + notification for applications entering attestation period
async function attestationRequiredNotificationCheck(
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
) {
  const config = await getAppConfig();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    const report = await getAttestableNotificationReport(currentDate, emailClient, config);
    logger.info(`${JOB_NAME} - Completed.`);
    if (report?.errors.length) {
      logger.warn(`${JOB_NAME} - Completed, with errors.`);
    }
    logger.info(`${JOB_NAME} - Returning report.`);
    return report;
  } catch (err) {
    logger.error(`${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`);
    return `${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`;
  }
}

const getAttestableNotificationReport = async (
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) => {
  const query = getAttestableQuery(config, currentDate);
  const attestableAppCount = await ApplicationModel.find(query).countDocuments();
  if (attestableAppCount === 0) {
    logger.info(`${JOB_NAME} - No applications are entering the attestation period.`);
    logger.info(`${JOB_NAME} - Generating report.`);
    return getEmptyReport();
  }

  logger.info(
    `${JOB_NAME} - ${attestableAppCount} applications are entering the attestation period.`,
  );
  const attestableApps = await ApplicationModel.find(query).exec();
  const apps: Application[] = attestableApps.map((app: ApplicationDocument) => {
    logger.info(`${JOB_NAME} - Should notify ${app.appId} regarding attestation.`);
    return app.toObject() as Application;
  });

  // is this waiting for each email chunk like i'm expecting?
  const emails = chunk(apps, REQUEST_CHUNK_SIZE).map(async (appChunk: Application[]) => {
    logger.info(`${JOB_NAME} - Initiating email requests.`);
    return Promise.allSettled(
      appChunk.map(async (app) => sendAttestationRequiredEmail(app, config, emailClient)),
    );
  });

  const results: PromiseSettledResult<any>[][] = [];
  for (const email of emails) {
    const result = (await email) as PromiseSettledResult<any>[];
    results.push(result);
  }
  const allResults = results.flat();
  logger.info(`${JOB_NAME} - Generating report.`);
  const attestationNotificationReport = buildReportItem(
    allResults,
    'attestationNotifications',
    JOB_NAME,
  );
  return attestationNotificationReport;
};

const getAttestableQuery = (config: AppConfig, currentDate: Date) => {
  const {
    durations: {
      attestation: { count, unitOfTime, daysToAttestation },
    },
  } = config;
  // find all apps that are APPROVED with an approval date matching the configured time period minus configured daysToAttestation
  // default is 1 year less 45 days to match DACO
  const attestationStartDate = moment(currentDate)
    .subtract(count, unitOfTime as unitOfTime.DurationConstructor)
    .add(daysToAttestation, NOTIFICATION_UNIT_OF_TIME);
  const query: FilterQuery<ApplicationDocument> = {
    state: 'APPROVED',
    approvedAtUtc: getDayRange(attestationStartDate),
    // tslint:disable-next-line:no-null-keyword
    $or: [{ attestedAtUtc: { $exists: false } }, { attestedAtUtc: { $eq: null } }], // check the applicant has not already attested, value may be null after renewal
  };

  return query;
};

export default attestationRequiredNotificationCheck;
