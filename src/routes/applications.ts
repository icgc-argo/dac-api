import { Router, Request, Response, RequestHandler } from 'express';
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
} from '../domain/service';
import { BadRequest } from '../utils/errors';
import logger from '../logger';
import { Identity } from '@overture-stack/ego-token-middleware';

import {
  ApplicationSummary,
  CSVFileHeader,
  FileFormat,
  State,
  UpdateApplication,
} from '../domain/interface';
import { AppConfig } from '../config';
import _, { uniqBy } from 'lodash';
import { Storage } from '../storage';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
// https://www.archiverjs.com/docs/quickstart
import archiver from 'archiver';
import moment from 'moment';
import { Readable } from 'stream';
import { getSearchParams, parseApprovedUser } from '../utils/misc';

interface IRequest extends Request {
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
      const type = validateType(req.params.type) as 'ETHICS' | 'SIGNED_APP';
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
      const assets = await getApplicationAssetsAsStream(
        appId,
        (req as IRequest).identity,
        storageClient,
      );
      const zip = archiver('zip', {
        zlib: { level: 0 },
      });

      // append all asset streams to the zip archive
      assets.forEach((a) => {
        zip.append(a.stream as Readable, { name: a.name });
      });

      const zipName = `${appId}_${moment().format('YYYYMMDD')}.zip`;
      res.attachment(zipName);

      // pipe the zip stream output to the response directly
      zip.pipe(res);

      // on zip finish end the response
      zip.on('finish', () => {
        res.status(200).end();
      });

      // finialize the zip.
      zip.finalize();
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
      const type = validateType(req.params.type) as 'ETHICS' | 'SIGNED_APP';
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
      const app = await deleteCollaborator(validatedId, collaboratorId, (req as IRequest).identity);
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
    authFilter([config.auth.REVIEW_SCOPE]),
    wrapAsync(async (req: Request, res: Response) => {
      logger.info(`exporting approved users for all applications`);
      const params = {
        ...getSearchParams(req),
        states: ['APPROVED'] as State[],
        includeCollaborators: true,
        cursorSearch: true,
      };
      const results = await search(params, (req as IRequest).identity);
      const fileFormat = req.query.format;
      // applicant + collaborators get daco access
      const parsedResults = results.items
        .map((appResult: ApplicationSummary) => {
          const applicantInfo = appResult.applicant.info;
          const applicant = parseApprovedUser(applicantInfo, appResult.lastUpdatedAtUtc);
          const collabs = (appResult.collaborators || []).map((collab) =>
            parseApprovedUser(collab, appResult.lastUpdatedAtUtc),
          );
          return [applicant, ...collabs];
        })
        .flat();

      // other formats may be added in future but for now only handling DACO_FILE_FORMAT type, all else will return 400
      if (fileFormat === FileFormat.DACO_FILE_FORMAT) {
        const fileHeaders: CSVFileHeader[] = [
          { accessor: 'userName', name: 'USER NAME' },
          { accessor: 'openId', name: 'OPENID' },
          { accessor: 'email', name: 'EMAIL' },
          { accessor: 'changed', name: 'CHANGED' }, // verify what this value should be
          { accessor: 'affiliation', name: 'AFFILIATION' },
        ];
        const headerRow: string[] = fileHeaders.map((header) => header.name);

        const uniqueApprovedUsers = uniqBy(parsedResults, 'openId').map((row: any) => {
          const dataRow: string[] = fileHeaders.map((header) => {
            // if value is missing, add empty string so the column has content
            return row[header.accessor as string] || '';
          });
          return dataRow.join(',');
        });

        res.set('Content-Type', 'text/csv');
        const withHeaders = [headerRow, ...uniqueApprovedUsers].join('\n');
        // TODO: verify the correct filename
        const currentDate = moment().tz('America/Toronto').format('YYYY-MM-DDTHH:mm');
        res.status(200).attachment(`daco-users-${currentDate}.csv`).send(withHeaders);
      } else {
        return res.status(400).send('Unrecognized or missing file format for export');
      }
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
    authFilter([config.auth.REVIEW_SCOPE]),
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
  if (!['ETHICS', 'SIGNED_APP', 'ethics', 'signed_app'].includes(type)) {
    throw new BadRequest('unknow document type, should be ETHICS or SIGNED_APP');
  }
  return type.toUpperCase();
}

export default createApplicationsRouter;
