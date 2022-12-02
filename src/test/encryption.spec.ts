import { expect } from 'chai';
import { createDecipheriv } from 'crypto';
import { encrypt } from '../utils/misc';
import {
  EMAIL_ENCRYPTION_CREDENTIALS_ENCODING,
  DACO_ENCRYPTION_ALGO,
  EMAIL_CONTENT_ENCODING,
} from '../utils/constants';
import logger from '../logger';

describe('encryption', () => {
  it('should encrypt and decrypt text', async () => {
    const text = `USER NAME,OPENID,EMAIL,CHANGED,AFFILIATION
    First Tester,tester1@sample_email.com,tester1@example.com,2021-07-23T16:49,Some Institute
    string 222 string 1,collab3@sample_email.com,collab3@example.com,2021-07-23T16:58,Some Institute
    First Tester,tester2@sample_email.com,tester2@example.com,,2021-07-27T11:01,Some Institute
    NewFirst Tester,tester3@sample_email.com,tester3@example.com,2021-08-04T12:48,Some Institute
    Betty Draper,betty50544@sample_email,betty_draper@example.com,2021-08-10T13:23,Some Institute
    Betty Boop,betty505@sample_email,betty_boop@example.com,2021-08-10T13:40,Some Institute
    Test2 Collab,collab_test2@sample_email,collab_test2@example.com,2021-08-11T13:00,Some Institute`;

    const mockEncryptionKey = '4E645267556B586E3272357538782F41';

    try {
      const encrypted = await encrypt(text, mockEncryptionKey);

      expect(encrypted).to.not.be.empty;
      expect(encrypted).to.haveOwnProperty('iv');
      expect(encrypted).to.haveOwnProperty('content');
      expect(typeof encrypted.iv).to.eq('string');
      expect(typeof encrypted.content).to.eq('string');

      // command to decrypt encrypted.content with openssl in command line:
      // openssl enc -aes-128-cbc -d -a -K <key> -iv <iv> -in <input file> -out <output file>
      // can use either -base64 or -a flag for decoding input

      const decipher = createDecipheriv(
        DACO_ENCRYPTION_ALGO,
        Buffer.from(mockEncryptionKey, EMAIL_ENCRYPTION_CREDENTIALS_ENCODING),
        Buffer.from(encrypted.iv, EMAIL_ENCRYPTION_CREDENTIALS_ENCODING),
      );
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted.content, EMAIL_CONTENT_ENCODING)),
        decipher.final(),
      ]);
      expect(decrypted.toString()).to.eq(text);
    } catch (err) {
      logger.error(err);
    }
  });
});
