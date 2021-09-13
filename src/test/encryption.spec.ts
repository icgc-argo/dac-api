import { expect } from 'chai';
import { createDecipheriv } from 'crypto';
import { encrypt } from '../utils/misc';
import { CHAR_ENCODING, DACO_ENCRYPTION_ALGO, IV_LENGTH } from '../utils/constants';

describe('encryption', () => {
  it.only('should encrypt and decrypt text', async () => {
    const text = `USER NAME,OPENID,EMAIL,CHANGED,AFFILIATION
    First Tester,tester1@sample_email.com,tester1@example.com,2021-07-23T16:49,Some Institute
    string 222 string 1,collab3@sample_email.com,collab3@example.com,2021-07-23T16:58,Some Institute
    First Tester,tester2@sample_email.com,tester2@example.com,,2021-07-27T11:01,Some Institute
    NewFirst Tester,tester3@sample_email.com,tester3@example.com,2021-08-04T12:48,Some Institute
    Betty Draper,betty50544@sample_email,betty_draper@example.com,2021-08-10T13:23,Some Institute
    Betty Boop,betty505@sample_email,betty_boop@example.com,2021-08-10T13:40,Some Institute
    Test2 Collab,collab_test2@sample_email,collab_test2@example.com,2021-08-11T13:00,Some Institute`;

    const mockEncryptionKey = '0123456789123456';

    try {
      const encrypted = await encrypt(text, mockEncryptionKey);

      expect(encrypted).to.not.be.empty;
      expect(encrypted).to.haveOwnProperty('iv');
      expect(encrypted).to.haveOwnProperty('content');
      expect(typeof encrypted?.iv).to.eq('string');
      expect(typeof encrypted?.content).to.eq('string');
      expect(Buffer.from(encrypted!.iv, CHAR_ENCODING).length).to.eq(IV_LENGTH);

      const decipher = createDecipheriv(
        DACO_ENCRYPTION_ALGO,
        mockEncryptionKey,
        Buffer.from(encrypted!.iv, CHAR_ENCODING),
      );

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted!.content, CHAR_ENCODING)),
        decipher.final(),
      ]);
      expect(decrypted.toString()).to.eq(text);
    } catch (err) {
      console.log(err);
    }
  });
});