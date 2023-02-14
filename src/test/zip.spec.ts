import JSZip from 'jszip';
import { Readable } from 'stream';
import fs from 'fs';

describe('zip', () => {
  it('should package string correctly', async () => {
    const encrypted = {
      content: 'ABC1234567890',
      iv: '123',
    };

    // build streams to zip later
    const ivStream = new Readable();
    ivStream.push(encrypted.iv);
    // eslint-disable-next-line no-null/no-null
    ivStream.push(null);
    const contentStream = new Readable();
    contentStream.push(encrypted.content);
    // eslint-disable-next-line no-null/no-null
    contentStream.push(null);

    // build the zip package
    const zip = new JSZip();
    [
      { name: 'iv.txt', stream: ivStream },
      { name: 'approved_users.csv.enc', stream: contentStream },
    ].forEach((a) => {
      zip.file(a.name, a.stream);
    });
    const zipFileOut = await zip.generateAsync({
      type: 'nodebuffer',
    });
    fs.writeFileSync('/tmp/test-zip.zip', zipFileOut);
  });
});
