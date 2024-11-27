import fs from 'fs';
import JSZip from 'jszip';
import { Readable } from 'stream';

describe('zip', () => {
  it('should package string correctly', async () => {
    const encrypted = {
      content: 'ABC1234567890',
      iv: '123',
    };

    // build streams to zip later
    const ivStream = new Readable();
    ivStream.push(encrypted.iv);
    ivStream.push(null);
    const contentStream = new Readable();
    contentStream.push(encrypted.content);
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
