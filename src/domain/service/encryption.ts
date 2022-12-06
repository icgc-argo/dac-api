import { createCipheriv, randomBytes } from 'crypto';

import {
  EMAIL_ENCRYPTION_CREDENTIALS_ENCODING,
  DACO_ENCRYPTION_ALGO,
  EMAIL_CONTENT_ENCODING,
  IV_LENGTH,
} from '../../utils/constants';

export const encrypt: (
  text: string,
  encryptionKey: string,
) => Promise<{ iv: string; content: string }> = async (text, encryptionKey) => {
  try {
    // create IV as a Buffer
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(
      DACO_ENCRYPTION_ALGO,
      Buffer.from(encryptionKey, EMAIL_ENCRYPTION_CREDENTIALS_ENCODING),
      iv,
    );
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    // split into 64-character lines, so -A is not needed in openssl command, apparently can be buggy with longer files
    // https://wiki.openssl.org/index.php/Command_Line_Utilities#Base64_Encoding_Strings
    const encodedContent = encrypted.toString(EMAIL_CONTENT_ENCODING).replace(/(.{64})/g, '$1\n');
    return {
      iv: iv.toString(EMAIL_ENCRYPTION_CREDENTIALS_ENCODING),
      content: encodedContent,
    };
  } catch (err) {
    console.error('Encryption failure: ', err);
    throw new Error('Encryption failure');
  }
};
