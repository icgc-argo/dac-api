import { UploadedFile } from 'express-fileupload';
import fetch from 'node-fetch';
import AWS, { S3 } from 'aws-sdk';
import * as uuid from 'uuid';

import logger from '../logger';
import { AppConfig } from '../config';
import { AppSecrets } from '../secrets';

export class Storage {
  private s3Client: S3;
  private readonly bucket: string;
  constructor(readonly config: AppConfig, readonly secrets: AppSecrets) {
    this.bucket = config.storage.bucket;
    this.s3Client = new AWS.S3({
      apiVersion: '2006-03-01',
      region: 'nova',
      endpoint: config.storage.endpoint,
      signatureVersion: 'v4',
      s3ForcePathStyle: true,
      credentials: {
        accessKeyId: secrets.storage.key,
        secretAccessKey: secrets.storage.secret,
      },
    });
  }

  async createBucket() {
    try {
      await this.s3Client
        .headBucket({
          Bucket: this.bucket,
        })
        .promise();
    } catch (err) {
      // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-0.html#unknown-on-catch-clause-bindings
      if (err instanceof Error) {
        if (err.name == 'TimeoutError') {
          console.error("couldn't connect to S3", err);
          return;
        }
      }
      console.error(`heading bucket: ${err}`, err);
      await this.s3Client
        .createBucket({
          Bucket: this.bucket,
        })
        .promise();
    }
  }

  async upload(file: UploadedFile, existingId?: string) {
    const id = existingId?.trim() || uuid.v4();
    const url = await this.s3Client.getSignedUrlPromise('putObject', {
      Bucket: this.bucket,
      Key: id,
      Expires: 300,
    });

    const response = await fetch(url, {
      method: 'PUT',
      body: file.data,
    });

    if (response.status !== 200) {
      throw new Error('Upload to storage service failed');
    }
    return id;
  }

  async downloadAsStream(id: string) {
    const url = await this.s3Client.getSignedUrlPromise('getObject', {
      Bucket: this.bucket,
      Key: id,
      Expires: 300,
    });

    const response = await fetch(url, {
      method: 'GET',
    });

    logger.info(`S3 response status for file id ${id}: ${response.status}`);
    logger.info(`S3 response size for file id ${id}: ${response.size}`);
    if (response.status !== 200) {
      throw new Error('Download from storage service failed');
    }
    return response.body;
  }

  async delete(objectId: string) {
    const url = await this.s3Client.getSignedUrlPromise('deleteObject', {
      Bucket: this.bucket,
      Key: objectId,
      Expires: 300,
    });

    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (response.status !== 204) {
      throw new Error('delete file failed');
    }
  }
}
