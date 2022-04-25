import { Router, Request, Response, RequestHandler } from 'express';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import moment from 'moment';
import { Identity } from '@overture-stack/ego-token-middleware';
import JSZip from 'jszip';
import _ from 'lodash';

import wrapAsync from '../utils/wrapAsync';
import {
  create,
  createCollaborator,
  deleteApp,
  deleteCollaborator,
  getById,
  search,
  updateCollaborator,
  uploadDocument,
  updatePartial,
  deleteDocument,
  getApplicationAssetsAsStream,
  sendEmail,
  searchCollaboratorApplications,
  createAppHistoryTSV,
} from '../domain/service';
import { BadRequest } from '../utils/errors';
import logger from '../logger';
import { FileFormat, UpdateApplication, UploadDocumentType } from '../domain/interface';
import { AppConfig, getAppConfig } from '../config';
import { Storage } from '../storage';
import { getSearchParams, createDacoCSVFile, encrypt } from '../utils/misc';
import { Readable } from 'stream';

export interface IRequest extends Request {
  identity: Identity;
}

const createApplicationsRouter = (
  config: AppConfig,
  authFilter: (scopes: string[]) => RequestHandler,
  storageClient: Storage,
  emailClient: Transporter<SMTPTransport.SentMessageInfo>,
) => {
  const router = Router();

  router.delete(
    '/applications/:id/assets/:type/assetId/:assetId',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const appId = validateId(req.params.id);
      const type = validateType(req.params.type) as UploadDocumentType;
      const objectId = req.params.assetId;
      logger.info(
        `delete document [app: ${appId}, type: ${type}, assetId: ${objectId}, user Id:${
          (req as IRequest).identity.userId
        }]`,
      );
      const app = await deleteDocument(
        appId,
        type,
        objectId,
        (req as IRequest).identity,
        storageClient,
      );
      return res.status(200).send(app);
    }),
  );

  router.get(
    '/applications/:id/assets/APP_PACKAGE',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const appId = validateId(req.params.id);
      logger.info(
        `download app package [app: ${appId}, user Id:${(req as IRequest).identity.userId}]`,
      );

      console.time('zip download');

      try {
        const assets = await getApplicationAssetsAsStream(
          appId,
          (req as IRequest).identity,
          storageClient,
        );

        const zip = new JSZip();
        assets.forEach((a) => {
          zip.file(a.name, a.stream);
        });
        const zipName = `${appId}_${moment().format('YYYYMMDD')}.zip`;
        res.set('Content-Type', 'application/zip');
        res.attachment(zipName);
        zip
          .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
          .pipe(res)
          .on('error', (err) => {
            logger.info(`Error in zip stream for ${appId}: ${err}`);
            res.status(500).write(err);
          })
          .on('finish', () => {
            logger.info(`Zip completed for ${appId}, sending response.`);
            console.timeEnd('zip download');
            res.status(200).send();
          });
      } catch (error) {
        logger.error(`Error downloading zip file for ${appId}: ${error}`);
        // https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-0.html#unknown-on-catch-clause-bindings
        if (error instanceof Error) {
          return res.status(500).send(error.message);
        }
        return res.status(500).send('An unknown error occurred.');
      }
    }),
  );

  router.post(
    '/applications/:id/assets/:type/upload',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const uploadedFile = req.files?.file;
      if (!uploadedFile) {
        throw new BadRequest('File is required');
      }
      if (_.isArray(uploadedFile)) {
        throw new BadRequest('Only one file');
      }
      const appId = validateId(req.params.id);
      const type = validateType(req.params.type) as UploadDocumentType;
      logger.info(
        `upload app file [app: ${appId}, type: ${type}, file: ${uploadedFile.name}, user Id:${
          (req as IRequest).identity.userId
        }]`,
      );
      const app = await uploadDocument(
        appId,
        type,
        uploadedFile,
        (req as IRequest).identity,
        storageClient,
        emailClient,
      );
      return res.status(201).send(app);
    }),
  );

  router.post(
    '/applications/',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      logger.info(`creating new application [user id: ${(req as IRequest).identity.userId}]`);
      const app = await create((req as IRequest).identity);
      return res.status(201).send(app);
    }),
  );

  router.post(
    '/applications/:id/collaborators',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      // todo validate structure
      const collaborator = req.body;
      logger.info(
        `creating new collaborator [app: ${id}, user Id:${(req as IRequest).identity.userId}]`,
      );
      const app = await createCollaborator(
        validatedId,
        collaborator,
        (req as IRequest).identity,
        emailClient,
      );
      return res.status(200).send(app);
    }),
  );

  router.put(
    '/applications/:id/collaborators/:collaboratorId',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      const collaboratorId = req.params.collaboratorId;
      // todo validate structure
      const collaborator = req.body;
      logger.info(
        `updating collaborators [app: ${id}, collaboratorId: ${collaboratorId}, user Id:${
          (req as IRequest).identity.userId
        }]`,
      );
      const app = await updateCollaborator(validatedId, collaborator, (req as IRequest).identity);
      return res.status(200).send(app);
    }),
  );

  router.delete(
    '/applications/:id/collaborators/:collaboratorId',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      const collaboratorId = req.params.collaboratorId;
      logger.info(
        `deleting collaborator [app: ${id}, collaboratorId: ${collaboratorId}, user Id:${
          (req as IRequest).identity.userId
        }]`,
      );
      const app = await deleteCollaborator(
        validatedId,
        collaboratorId,
        (req as IRequest).identity,
        emailClient,
      );
      return res.status(200).send(app);
    }),
  );

  router.get(
    '/applications/',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const params = getSearchParams(req, 'state:desc');
      logger.info(
        `searching applications [query: ${JSON.stringify(params)}, user Id:${
          (req as IRequest).identity.userId
        }]`,
      );
      const app = await search(params, (req as IRequest).identity);
      return res.status(200).send(app);
    }),
  );

  router.get(
    '/export/approved-users/',
    authFilter([config.auth.reviewScope]),
    wrapAsync(async (req: Request, res: Response) => {
      logger.info(`exporting approved users for all applications`);

      const fileFormat = req.query.format;
      // other formats may be added in future but for now only handling DACO_FILE_FORMAT type, all else will return 400
      if (fileFormat === FileFormat.DACO_FILE_FORMAT) {
        // createCSV
        const csv = await createDacoCSVFile(req);
        const currentDate = moment().tz('America/Toronto').format('YYYY-MM-DDTHH:mm');
        res.set('Content-Type', 'text/csv');
        res.status(200).attachment(`daco-users-${currentDate}.csv`).send(csv);
      } else {
        throw new BadRequest('Unrecognized or missing file format for export');
      }
    }),
  );

  router.get(
    '/jobs/export-and-email/',
    authFilter([config.auth.reviewScope]),
    wrapAsync(async (req: Request, res: Response) => {
      // generate CSV file from approved users
      const csv = await createDacoCSVFile(req);
      // encrypt csv content, return {content, iv}
      const config = await getAppConfig();
      try {
        // encrypt the contents
        const encrypted = await encrypt(csv, config.auth.dacoEncryptionKey);

        // build streams to zip later
        const ivStream = new Readable();
        ivStream.push(encrypted.iv);
        // tslint:disable-next-line:no-null-keyword
        ivStream.push(null);
        const contentStream = new Readable();
        contentStream.push(encrypted.content);
        // tslint:disable-next-line:no-null-keyword
        contentStream.push(null);

        // build the zip package
        const zip = new JSZip();
        [
          {name: 'iv.txt', stream: ivStream},
          {name: 'approved_users.csv.enc', stream: contentStream }
        ].forEach((a) => {
          zip.file(a.name, a.stream);
        });
        const zipFileOut = await zip.generateAsync({
          type: 'nodebuffer'
        });
        const zipName = `icgc_daco_users.zip`;

        // send the email
        sendEmail(
          emailClient,
          config.email.fromAddress,
          config.email.fromName,
          new Set([config.email.dccMailingList]),
          'Approved DACO Users',
          `find the attached zip package`,
          undefined,
          [
            {
              filename: zipName,
              content: zipFileOut,
              contentType: 'application/zip',
            },
          ],
        );
        return res.status(200).send('OK');
      } catch (err) {
        logger.error('failed to export users and email them');
        logger.error(err);
        if (err instanceof Error) {
          return res.status(500).send(err.message);
        }
        res.status(500).send('An unknown error occurred.');
      }
    }),
  );

  router.get(
    '/export/application-history/',
    authFilter([config.auth.reviewScope]),
    wrapAsync(async (req: Request, res: Response) => {
      const tsv = await createAppHistoryTSV();
      const currentDate = moment().tz('America/Toronto').format(`YYYY-MM-DD`);
      res.set('Content-Type', 'text/tsv');
      res.status(200).attachment(`daco-app-history-${currentDate}.tsv`).send(tsv);
    }),
  );

  router.get(
    '/applications/:id',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      logger.info(
        `fetching application [app: ${id}, user Id:${(req as IRequest).identity.userId}]`,
      );
      const result = await getById(validatedId, (req as IRequest).identity);
      if (!result) {
        return res.status(404).send();
      }
      return res.status(200).send(result);
    }),
  );

  router.delete(
    '/applications/:id',
    authFilter([config.auth.reviewScope]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      logger.info(
        `deleting application [app: ${id}, user Id:${(req as IRequest).identity.userId}]`,
      );
      await deleteApp(validatedId, (req as IRequest).identity);
      return res.status(200).end();
    }),
  );

  router.patch(
    '/applications/:id',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      const app = req.body as Partial<UpdateApplication>;
      logger.info(
        `updating application [app: ${id}, user Id:${(req as IRequest).identity.userId}]`,
      );
      const updated = await updatePartial(
        id,
        app,
        (req as IRequest).identity,
        storageClient,
        emailClient,
      );
      return res.status(200).send(updated);
    }),
  );

  router.get(
    '/collaborators/applications',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const user = (req as IRequest).identity;
      const applications = await searchCollaboratorApplications(user);
      return res.status(200).send(applications);
    }),
  );

  return router;
};

function validateId(id: string) {
  if (!id) {
    throw new BadRequest('id is required');
  }
  if (!id.startsWith('DACO-')) {
    throw new BadRequest('Invalid id');
  }
  return id;
}

function validateType(type: string) {
  if (
    !['ETHICS', 'SIGNED_APP', 'APPROVED_PDF', 'ethics', 'signed_app', 'approved_pdf'].includes(type)
  ) {
    throw new BadRequest(
      'unknown document type, should be one of ETHICS, SIGNED_APP or APPROVED_PDF',
    );
  }
  return type.toUpperCase();
}

export default createApplicationsRouter;
