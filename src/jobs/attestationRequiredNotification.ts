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
import { buildReportItem, getDayRange, getEmptyReport } from './utils';
import { sendAttestationOpenNotificationEmail } from '../domain/service';

// Check + notification for applications entering attestation period
export default async function (
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
) {
  const config = await getAppConfig();
  try {
    logger.info('Initiating attestation notification check...');
    // check func needs to return report
    const report = await runAttestableNotificationCheck(currentDate, emailClient, config);
    if (report?.errors.length) {
      logger.warn('Attestation notification check completed, with errors.');
    }
    return report;
  } catch (err) {
    logger.error(
      `Attestation notification check failed to complete, with error: ${(err as Error).message}`,
    );
    return `Attestation notification check failed to complete, with error: ${
      (err as Error).message
    }`;
  }
}

const runAttestableNotificationCheck = async (
  currentDate: Date,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
  config: AppConfig,
) => {
  // const query = getAttestableQuery(config, currentDate);
  const query: FilterQuery<ApplicationDocument> = { state: 'APPROVED' };
  const attestableAppCount = await ApplicationModel.find(query).countDocuments();
  if (attestableAppCount === 0) {
    logger.info('No applications are entering the attestation period.');
    logger.info('ATTESTATION NOTIFICATIONS - Complete');
    return getEmptyReport();
  }

  const attestableApps = await ApplicationModel.find(query).exec();
  const apps: Application[] = attestableApps.map(
    (app: ApplicationDocument) => app.toObject() as Application,
  );

  const emails = chunk(apps, REQUEST_CHUNK_SIZE).map(async (appChunk: Application[]) => {
    return Promise.allSettled(
      appChunk.map(async (app) => sendAttestationOpenNotificationEmail(app, emailClient, config)),
    );
  });

  const results: PromiseSettledResult<any>[][] = [];
  for (const email of emails) {
    const result = (await email) as PromiseSettledResult<any>[];
    results.push(result);
  }
  const allResults = results.flat();
  const attestationNotificationReport = buildReportItem(allResults, 'attestationNotifications');
  logger.info('ATTESTATION NOTIFICATIONS - Complete');
  return attestationNotificationReport;
};

const getAttestableQuery = (config: AppConfig, currentDate: Date) => {
  const {
    durations: {
      attestation: { count, unitOfTime, daysToAttestation },
    },
  } = config;
  // find all apps that are APPROVED with an approval date matching the configured time period + configured daysToAttestation
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
