/*
 * Copyright (c) 2021 The Ontario Institute for Cancer Research. All rights reserved
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
import { c } from './utils/misc';
import * as vault from './vault';

let currentConfig: AppConfig;

export interface AppConfig {
  // Express
  serverPort: string;
  basePath: string;
  openApiPath: string;
  kafkaProperties: KafkaConfigurations;
  mongoProperties: MongoProps;
  email: {
    host: string;
    dacoAddress: string;
    fromAddress: string;
    fromName: string;
    port: number;
    reviewerFirstName: string;
    reviewerLastName: string;
    auth: {
      user: string | undefined;
      password: string | undefined;
    },
    links: {
      reviewGuide: string;
    }
  };
  ui: {
    baseUrl: string;
    sectionPath: string;
  };
  auth: {
    enabled: boolean;
    jwtKeyUrl: string;
    jwtKey: string;
    REVIEW_SCOPE: string;
  };
  storage: {
    endpoint: string;
    region: string;
    key: string;
    secret: string;
    bucket: string;
    timeout: number;
  };
}

export interface MongoProps {
  // Mongo
  dbUser: string;
  dbPassword: string;
  dbName: string;
  dbUrl: string; // allow overriding all the url
  writeConcern: string;
  writeAckTimeout: number;
}
export interface KafkaConfigurations {
  kafkaMessagingEnabled: boolean;
  kafkaClientId: string;
  kafkaBrokers: string[];
}

const buildBootstrapContext = async () => {
  dotenv.config();

  const vaultEnabled = process.env.VAULT_ENABLED || false;
  let secrets: any = {};
  /** Vault */
  if (vaultEnabled) {
    if (process.env.VAULT_ENABLED && process.env.VAULT_ENABLED == 'true') {
      if (!process.env.VAULT_SECRETS_PATH) {
        throw new Error('Path to secrets not specified but vault is enabled');
      }
      try {
        secrets = await vault.loadSecret(process.env.VAULT_SECRETS_PATH);
      } catch (err) {
        console.error(err);
        throw new Error('failed to load secrets from vault.');
      }
    }
  }
  return secrets;
};

const buildAppContext = async (secrets: any): Promise<AppConfig> => {
  console.log('building app context');
  const config: AppConfig = {
    serverPort: process.env.PORT || '3000',
    basePath: process.env.BASE_PATH || '/',
    openApiPath: process.env.OPENAPI_PATH || '/api-docs',
    mongoProperties: {
      dbName: secrets.DB_NAME || process.env.DB_NAME,
      dbUser: secrets.DB_USERNAME || process.env.DB_USERNAME,
      dbPassword: secrets.DB_PASSWORD || process.env.DB_PASSWORD,
      dbUrl: secrets.DB_URL || process.env.DB_URL || `mongodb://localhost:27027/appdb`,
      writeConcern: process.env.DEFAULT_WRITE_CONCERN || 'majority',
      writeAckTimeout: Number(process.env.DEFAULT_WRITE_ACK_TIMEOUT) || 5000,
    },
    kafkaProperties: {
      kafkaBrokers: process.env.KAFKA_BROKERS?.split(',') || new Array<string>(),
      kafkaClientId: process.env.KAFKA_CLIENT_ID || '',
      kafkaMessagingEnabled: process.env.KAFKA_MESSAGING_ENABLED === 'true' ? true : false,
    },
    auth: {
      enabled: process.env.AUTH_ENABLED !== 'false',
      jwtKeyUrl: process.env.JWT_KEY_URL || '',
      jwtKey: process.env.JWT_KEY || '',
      REVIEW_SCOPE: process.env.REVIEW_SCOPE || 'DACO-REVIEW.WRITE'
    },
    ui: {
      baseUrl: process.env.DACO_UI_BASE_URL || 'https://daco.icgc-argo.org',
      sectionPath: process.env.DACO_UI_APPLICATION_SECTION_PATH || '/applications/{id}?section={section}',
    },
    storage: {
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT || '',
      region: process.env.OBJECT_STORAGE_REGION || 'nova',
      bucket: process.env.OBJECT_STORAGE_BUCKET || 'daco',
      key:  secrets.OBJECT_STORAGE_KEY || process.env.OBJECT_STORAGE_KEY,
      secret: secrets.OBJECT_STORAGE_SECRET || process.env.OBJECT_STORAGE_SECRET,
      timeout: Number(process.env.OBJECT_STORAGE_TIMEOUT_MILLIS) || 5000,
    },
    email: {
      host: c(process.env.EMAIL_HOST),
      port: Number(c(process.env.EMAIL_PORT)),
      dacoAddress: process.env.EMAIL_DACO_ADDRESS || 'daco@icgc-argo.org',
      fromName: process.env.EMAIL_FROM_NAME || 'ICGC DACO',
      fromAddress: process.env.EMAIL_FROM_ADDRESS || 'no-reply-daco@icgc-argo.org',
      auth: {
        user: secrets.EMAIL_USER || process.env.EMAIL_USER,
        password: secrets.EMAIL_PASSWORD || process.env.EMAIL_PASSWORD,
      },
      links: {
        reviewGuide: process.env.EMAIL_REVIEW_GUIDE_URL || 'https://daco.icgc-argo.org/guides/review',
      },
      reviewerFirstName: process.env.EMAIL_REVIEWER_FIRSTNAME || 'DACO',
      reviewerLastName: process.env.EMAIL_REVIEWER_LASTNAME || 'administrator',
    }
  };
  return config;
};

export const getAppConfig = async (): Promise<AppConfig> => {
  if (currentConfig) {
    return currentConfig;
  }
  const secrets = await buildBootstrapContext();
  currentConfig = await buildAppContext(secrets);
  return currentConfig;
};
