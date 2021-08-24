import { expect } from 'chai';
import { randomBytes, randomFill, createDecipheriv } from 'crypto';
import { encryptFile } from '../utils/misc';

describe('encryption', () => {
  it('should generate an initial value', () => {
    randomFill(new Uint8Array(16), (err, iv) => {
      if (err) {
        console.log('ERR: ', err);
      }
      console.log('iv: ', iv);
    });
  });

  it('should generate a random buffer at 256 bytes', () => {
    randomBytes(256, (err, buf) => {
      if (err) throw err;
      console.log(`${buf.length} bytes of random data: ${buf.toString('hex')}`);
    });
  });

  it('should generate a random buffer at 16 bytes', () => {
    const wat = randomBytes(16).toString('hex');
    console.log(wat);
    randomBytes(16, (err, buf) => {
      if (err) throw err;
      // console.log(buf);
      console.log(`${buf.length} bytes of random data: ${buf.toString('hex')}`);
    });
  });

  it.only('should encrypt something', async () => {
    const text = `USER NAME,OPENID,EMAIL,CHANGED,AFFILIATION
    First Tester,tester1@sample_email.com,tester1@example.com,2021-07-23T16:49,OICR
    string 222 string 1,collab3@sample_email.com,string3@example.com,2021-07-23T16:58,OICR
    First Tester,tester2@sample_email.com,tester2@example.com,2021-07-27T11:01,OICR
    NewFirst Tester,tester3@sample_email.com,tester3@example.com,2021-08-04T12:48,OICR
    Betty Draper,betty50544@sample_email.com,betty_draper@example.com,2021-08-10T13:23,OICR
    Betty Boop,betty505@sample_email.com,betty_boop@example.com,2021-08-10T13:40,OICR
    Test2 Collab,collab_test2@sample_email.com,collab_test2@example.com,2021-08-11T13:00,OICR`;

    // const text = 'some text to encrypt';
    const encrypted = await encryptFile(text);

    expect(encrypted).to.haveOwnProperty('iv');
    expect(encrypted).to.haveOwnProperty('content');
    console.log('wat: ', encrypted);

    const decipher = createDecipheriv('aes-128-cbc', encrypted.key, encrypted.iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted.content)),
      decipher.final(),
    ]).toString();
    console.log('dec: ', decrypted);
    expect(decrypted).to.eq(text);
  });
});

// does encryption succeed (no error thrown)
// does encryption return something (a string? or, can you call toString() successfully?)
// can you decrypt the encrypted content with the iv and key
// does the decrypted content match the original content
// not sure about error response for this
// probably should test with mock csv content to make sure structure is preserved?
