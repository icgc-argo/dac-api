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
import * as dotenv from 'dotenv';
import moment from 'moment';

import { checkIsDefined } from './utils/misc';

let currentConfig: AppConfig;

export interface AppConfig {
  // Express
  serverPort: string;
  basePath: string;
  openApiPath: string;
  kafkaProperties: KafkaConfigurations;
  mongoProperties: MongoProps;
  logLevel: string;
  isDevelopment: boolean;
  email: {
    host: string;
    dacoAddress: string;
    fromAddress: string;
    fromName: string;
    port: number;
    reviewerFirstName: string;
    reviewerLastName: string;
    dccMailingList: string;
    links: {
      approvalGuide: string;
      reviewGuide: string;
      applyingForAccess: string;
      dataAccessGuide: string;
      revisionsRequestedGuide: string;
      dacoSurvey: string;
      accessRenewalGuide: string;
      attestationGuide: string;
      generalApplicationGuide: string;
    };
  };
  ui: {
    baseUrl: string;
    sectionPath: string;
  };
  auth: {
    enabled: boolean;
    jwtKeyUrl: string;
    jwtKey: string;
    reviewScope: string;
    dacoSystemScope: string;
    readOnlyReviewScope: string;
  };
  storage: {
    endpoint: string;
    region: string;
    bucket: string;
    timeout: number;
  };
  // unitOfTime must be one of these keys https://momentjs.com/docs/#/manipulating/add/
  durations: {
    expiry: {
      daysToExpiry1: number;
      daysToExpiry2: number;
      daysPostExpiry: number;
      count: number; // period length
      unitOfTime: moment.unitOfTime.DurationConstructor;
    };
    attestation: {
      count: number;
      unitOfTime: moment.unitOfTime.DurationConstructor;
      daysToAttestation: number;
    };
  };
  featureFlags: {
    renewalEnabled: boolean;
    adminPauseEnabled: boolean;
  };
  ega: {
    clientId: string;
    authHost: string;
    authRealmName: string;
    apiUrl: string;
    dacId: string;
  };
}

// Mongo
export interface MongoProps {
  writeConcern: string;
  writeAckTimeout: number;
}

export interface KafkaConfigurations {
  kafkaMessagingEnabled: boolean;
  kafkaClientId: string;
  kafkaBrokers: string[];
}

const buildAppContext = (): AppConfig => {
  dotenv.config();

  const config: AppConfig = {
    serverPort: process.env.PORT || '3000',
    basePath: process.env.BASE_PATH || '/',
    openApiPath: process.env.OPENAPI_PATH || '/api-docs',
    isDevelopment: String(process.env.NODE_ENV).toLowerCase() === 'development',
    mongoProperties: {
      writeConcern: process.env.DEFAULT_WRITE_CONCERN || 'majority',
      writeAckTimeout: Number(process.env.DEFAULT_WRITE_ACK_TIMEOUT) || 5000,
    },
    kafkaProperties: {
      kafkaBrokers: process.env.KAFKA_BROKERS?.split(',') || new Array<string>(),
      kafkaClientId: process.env.KAFKA_CLIENT_ID || '',
      kafkaMessagingEnabled: process.env.KAFKA_MESSAGING_ENABLED === 'true' ? true : false,
    },
    logLevel: process.env.LOG_LEVEL || 'debug',
    auth: {
      enabled: process.env.AUTH_ENABLED !== 'false',
      jwtKeyUrl: process.env.JWT_KEY_URL || '',
      jwtKey: process.env.JWT_KEY || '',
      reviewScope: `${process.env.DACO_REVIEW_POLICY_NAME || 'DACO-REVIEW'}.WRITE`,
      readOnlyReviewScope: `${process.env.DACO_REVIEW_POLICY_NAME || 'DACO-REVIEW'}.READ`,
      dacoSystemScope: process.env.DACO_SYSTEM_SCOPE || 'DACO-SYSTEM.WRITE',
    },
    ui: {
      baseUrl: checkIsDefined(process.env.DACO_UI_BASE_URL), // used for email links only
      sectionPath:
        process.env.DACO_UI_APPLICATION_SECTION_PATH || '/applications/{id}?section={section}',
    },
    storage: {
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT || '',
      region: process.env.OBJECT_STORAGE_REGION || 'nova',
      bucket: process.env.OBJECT_STORAGE_BUCKET || 'daco',
      timeout: Number(process.env.OBJECT_STORAGE_TIMEOUT_MILLIS) || 5000,
    },
    email: {
      host: checkIsDefined(process.env.EMAIL_HOST),
      port: Number(checkIsDefined(process.env.EMAIL_PORT)),
      dacoAddress: process.env.EMAIL_DACO_ADDRESS || 'daco@icgc-argo.org',
      fromName: process.env.EMAIL_FROM_NAME || 'ICGC DACO',
      fromAddress: process.env.EMAIL_FROM_ADDRESS || 'no-reply-daco@icgc-argo.org',
      dccMailingList: process.env.DCC_MAILING_LIST || '',
      links: {
        approvalGuide:
          process.env.EMAIL_APPROVAL_GUIDE ||
          'https://docs.icgc-argo.org/docs/data-access/daco/approval',
        reviewGuide:
          process.env.EMAIL_REVIEW_GUIDE_URL ||
          'https://docs.icgc-argo.org/docs/data-access/daco/approval#review-process',
        applyingForAccess:
          process.env.EMAIL_APPLYING_FOR_ACCESS_GUIDE_URL ||
          'https://docs.icgc-argo.org/docs/data-access/data-access',
        dataAccessGuide:
          process.env.EMAIL_DATA_ACCESS_GUIDE_URL ||
          'https://docs.icgc-argo.org/docs/data-access/data-download',
        revisionsRequestedGuide:
          process.env.REVISIONS_REQUESTED_GUIDE_URL ||
          'https://docs.icgc-argo.org/docs/data-access/daco/approval#requested-revisions',
        dacoSurvey: process.env.DACO_SURVEY_URL || '#',
        accessRenewalGuide:
          process.env.ACCESS_RENEWAL_GUIDE ||
          'https://docs.icgc-argo.org/docs/data-access/daco/renew-close#renewing-an-application',
        attestationGuide:
          process.env.ATTESTATION_GUIDE ||
          'https://docs.icgc-argo.org/docs/data-access/daco/renew-close#annual-attestation',
        generalApplicationGuide:
          process.env.GENERAL_APPLICATION_GUIDE ||
          'https://docs.icgc-argo.org/docs/data-access/daco/applying',
      },
      reviewerFirstName: process.env.EMAIL_REVIEWER_FIRSTNAME || 'DACO',
      reviewerLastName: process.env.EMAIL_REVIEWER_LASTNAME || 'administrator',
    },
    durations: {
      expiry: {
        daysToExpiry1: Number(process.env.DAYS_TO_EXPIRY_1) || 90,
        daysToExpiry2: Number(process.env.DAYS_TO_EXPIRY_2) || 45,
        daysPostExpiry: Number(process.env.DAYS_POST_EXPIRY) || 90,
        count: Number(process.env.EXPIRY_UNIT_COUNT) || 2,
        unitOfTime: isUnitOfTime(process.env.EXPIRY_UNIT_OF_TIME)
          ? process.env.EXPIRY_UNIT_OF_TIME
          : 'years',
      },
      attestation: {
        count: Number(process.env.ATTESTATION_UNIT_COUNT) || 1,
        unitOfTime: isUnitOfTime(process.env.ATTESTATION_UNIT_OF_TIME)
          ? process.env.ATTESTATION_UNIT_OF_TIME
          : 'years',
        daysToAttestation: Number(process.env.DAYS_TO_ATTESTATION) || 45,
      },
    },
    featureFlags: {
      renewalEnabled: process.env.FEATURE_RENEWAL_ENABLED === 'true',
      adminPauseEnabled: process.env.FEATURE_ADMIN_PAUSE_ENABLED === 'true',
    },
    ega: {
      clientId: checkIsDefined(process.env.EGA_CLIENT_ID),
      authHost: checkIsDefined(process.env.EGA_AUTH_HOST),
      authRealmName: checkIsDefined(process.env.EGA_AUTH_REALM_NAME),
      apiUrl: checkIsDefined(process.env.EGA_API_URL),
      dacId: checkIsDefined(process.env.DAC_ID),
    },
  };
  return config;
};

// This validates our environment variable matches a unit from the `moment` library
// We only accept years, months, weeks, or days - minutes etc. are considered too short for our application's logic
function isUnitOfTime(input?: string): input is moment.unitOfTime.DurationConstructor {
  if (input === undefined || input === '') {
    // will use default value
    return false;
  } else if (
    input &&
    [
      'year',
      'years',
      'y',
      'month',
      'months',
      'M',
      'week',
      'weeks',
      'w',
      'day',
      'days',
      'd',
    ].includes(input)
  ) {
    return true;
  } else {
    // Stop startup if our env variables would break our code.
    throw new Error(`App cannot use the provided unitOfTime: ${input}`);
  }
}

export const getAppConfig = (): AppConfig => {
  if (currentConfig) {
    return currentConfig;
  }
  currentConfig = buildAppContext();
  return currentConfig;
};
