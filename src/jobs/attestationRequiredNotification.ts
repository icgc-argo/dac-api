import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import moment from 'moment';
import { FilterQuery } from 'mongoose';
import { chunk } from 'lodash';

import logger from '../logger';
import { AppConfig, getAppConfig } from '../config';
import { NOTIFICATION_UNIT_OF_TIME, REQUEST_CHUNK_SIZE } from '../utils/constants';
import { ApplicationDocument, ApplicationModel } from '../domain/model';
import { Application } from '../domain/interface';
import { buildReportDetails, getEmptyReportDetails } from './utils';
import { sendAttestationRequiredEmail } from '../domain/service';
import { getDayRange } from '../utils/calculations';
import { BatchJobDetails, JobReport, JobResultForApplication } from './types';

export const JOB_NAME = 'ATTESTATION REQUIRED NOTIFICATIONS';

// Check + notification for applications entering attestation period
async function attestationRequiredNotificationCheck(
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<JobReport<BatchJobDetails>> {
  const startedAt = new Date();
  try {
    logger.info(`${JOB_NAME} - Initiating...`);
    const details = await getAttestableNotificationReportDetails(currentDate, emailClient);
    details.errors.length
      ? logger.warn(`${JOB_NAME} - Completed with errors.`)
      : logger.info(`${JOB_NAME} - Completed.`);
    const finishedAt = new Date();
    const jobSuccessReport: JobReport<BatchJobDetails> = {
      jobName: JOB_NAME,
      startedAt,
      finishedAt,
      success: true,
      details,
    };
    logger.info(`${JOB_NAME} - Report: ${JSON.stringify(jobSuccessReport)}`);
    return jobSuccessReport;
  } catch (err) {
    logger.error(`${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`);
    const finishedAt = new Date();
    const jobFailedReport: JobReport<BatchJobDetails> = {
      jobName: JOB_NAME,
      startedAt,
      finishedAt,
      success: false,
      error: `${JOB_NAME} - Failed to complete, with error: ${(err as Error).message}`,
    };
    logger.error(`${JOB_NAME} - Report: ${JSON.stringify(jobFailedReport)}`);
    return jobFailedReport;
  }
}

const getAttestableNotificationReportDetails = async (
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
): Promise<BatchJobDetails> => {
  const config = getAppConfig();
  const query = getAttestableQuery(config, currentDate);
  const attestableAppCount = await ApplicationModel.find(query).countDocuments();
  if (attestableAppCount === 0) {
    logger.info(`${JOB_NAME} - No applications are entering the attestation period.`);
    logger.info(`${JOB_NAME} - Generating report.`);
    return getEmptyReportDetails();
  }
  logger.info(
    `${JOB_NAME} - ${attestableAppCount} applications are entering the attestation period.`,
  );
  const attestableApps = await ApplicationModel.find(query).exec();
  const apps: Application[] = attestableApps.map((app: ApplicationDocument) => {
    return app.toObject();
  });

  logger.info(`${JOB_NAME} - Initiating email requests.`);
  const sendNotification = async (app: Application): Promise<JobResultForApplication> => {
    try {
      await sendAttestationRequiredEmail(app, config, emailClient);
      return { success: true, app };
    } catch (err: unknown) {
      // Error thrown in one of our async operations
      logger.error(
        `${JOB_NAME} - Error caught while sending attestation required email for ${app.appId} - ${err}`,
      );
      return { success: false, app, message: `${err}` };
    }
  };
  const chunkedEmails = chunk(apps, REQUEST_CHUNK_SIZE);
  const results: JobResultForApplication[][] = [];
  for (const email of chunkedEmails) {
    const result = await Promise.all(email.map(sendNotification));
    results.push(result);
  }
  const allResults = results.flat();
  logger.info(`${JOB_NAME} - Generating report.`);
  const attestationNotificationReport = buildReportDetails(
    allResults,
    'attestationNotifications',
    JOB_NAME,
  );
  return attestationNotificationReport;
};

const getAttestableQuery = (
  config: AppConfig,
  currentDate: Date,
): FilterQuery<ApplicationDocument> => {
  const {
    durations: {
      attestation: { count, unitOfTime, daysToAttestation },
    },
  } = config;
  // find all apps that are APPROVED with an approval date matching the configured time period minus configured daysToAttestation
  // default is 1 year less 45 days to match DACO
  const attestationStartDate = moment(currentDate)
    .subtract(count, unitOfTime)
    .add(daysToAttestation, NOTIFICATION_UNIT_OF_TIME);
  const approvalDayRange = getDayRange(attestationStartDate);
  logger.info(
    `${JOB_NAME} - Approval day period is ${approvalDayRange.$gte} to ${approvalDayRange.$lte}`,
  );
  const query: FilterQuery<ApplicationDocument> = {
    state: 'APPROVED',
    approvedAtUtc: approvalDayRange,
    // tslint:disable-next-line:no-null-keyword
    $or: [{ attestedAtUtc: { $exists: false } }, { attestedAtUtc: { $eq: null } }], // check the applicant has not already attested, value may be null after renewal
  };

  return query;
};

export default attestationRequiredNotificationCheck;
