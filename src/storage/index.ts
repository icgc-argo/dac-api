import { UploadedFile } from 'express-fileupload';
import { AppConfig, getAppConfig } from '../config';
import _ from 'lodash';
import fetch from 'node-fetch';
import AWS, { S3 } from 'aws-sdk';
import * as uuid from 'uuid';
let config: AppConfig;

(async () => {
  config = await getAppConfig();
});

export class Storage {

  private s3Client: S3;
  private readonly bucket: string;
  constructor(readonly config: AppConfig) {
    this.bucket = config.storage.bucket;
    this.s3Client = new AWS.S3({
      apiVersion: '2006-03-01',
      region: 'nova',
      endpoint: config.storage.endpoint,
      signatureVersion: 'v4',
      s3ForcePathStyle: true,
      credentials: {
        accessKeyId: config.storage.key,
        secretAccessKey: config.storage.secret
      },
    });
   }

  async createBucket() {
    try {
      await this.s3Client.headBucket({
        Bucket: this.bucket,
      }).promise();
    } catch (err) {
      if (err.name == 'TimeoutError') {
        console.error('couldn\'t connect to S3', err);
        return;
      }
      console.error(`heading bucket: ${err}`, err);
      await this.s3Client.createBucket({
        Bucket: this.bucket
      }).promise();
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


