import * as dotenv from 'dotenv';
import * as vault from './vault';

export interface MongoSecrets {
  dbUser: string;
  dbPassword: string;
  dbName: string;
  dbUrl: string; // allow overriding all the url
}

export interface AppSecrets {
  email: {
    auth: {
      user: string | undefined;
      password: string | undefined;
    };
  };
  auth: {
    dacoEncryptionKey: string;
  };
  storage: {
    key: string;
    secret: string;
  };
  mongoProperties: MongoSecrets;
}

dotenv.config();
let secrets: AppSecrets | undefined = undefined;

const vaultEnabled = (process.env.VAULT_ENABLED || '').toLowerCase() === 'true';

const loadVaultSecrets = async () => {
  console.info('Loading Vault secrets...');
  try {
    if (process.env.VAULT_SECRETS_PATH) {
      return await vault.loadSecret(process.env.VAULT_SECRETS_PATH);
    }
    throw new Error('Path to secrets not specified but vault is enabled');
  } catch (err) {
    console.error(err);
    throw new Error('Failed to load secrets from vault.');
  }
};

const buildSecrets = async (vaultSecrets: Record<string, any> = {}): Promise<AppSecrets> => {
  console.info('Building app secrets...');

  secrets = {
    email: {
      auth: {
        user: vaultSecrets.EMAIL_USER || process.env.EMAIL_USER || '',
        password: vaultSecrets.EMAIL_PASSWORD || process.env.EMAIL_PASSWORD || '',
      },
    },
    auth: {
      dacoEncryptionKey: vaultSecrets.DACO_ENCRYPTION_KEY || process.env.DACO_ENCRYPTION_KEY || '',
    },
    storage: {
      key: vaultSecrets.OBJECT_STORAGE_KEY || process.env.OBJECT_STORAGE_KEY || '',
      secret: vaultSecrets.OBJECT_STORAGE_SECRET || process.env.OBJECT_STORAGE_SECRET || '',
    },
    mongoProperties: {
      dbName: vaultSecrets.DB_NAME || process.env.DB_NAME || '',
      dbUser: vaultSecrets.DB_USERNAME || process.env.DB_USERNAME || '',
      dbPassword: vaultSecrets.DB_PASSWORD || process.env.DB_PASSWORD || '',
      dbUrl: vaultSecrets.DB_URL || process.env.DB_URL || `mongodb://localhost:27027/appdb`,
    },
  };
  return secrets;
};

const getAppSecrets = async () => {
  if (secrets !== undefined) {
    return secrets;
  }
  if (vaultEnabled) {
    const vaultSecrets = await loadVaultSecrets();
    return buildSecrets(vaultSecrets);
  }

  return buildSecrets();
};

export default getAppSecrets;
