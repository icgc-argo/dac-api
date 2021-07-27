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
  Application,
  ApplicationSummary,
  FileFormat,
  PersonalInfo,
  State,
  UpdateApplication,
} from '../domain/interface';
import { AppConfig } from '../config';
import _ from 'lodash';
import { Storage } from '../storage';
import { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
// https://www.archiverjs.com/docs/quickstart
import archiver from 'archiver';
import moment from 'moment';
import { Readable } from 'stream';

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

  const getSearchParams = (req: Request, defaultSort: string) => {
    const query = (req.query.query as string | undefined) || '';
    const states = req.query.states ? ((req.query.states as string).split(',') as State[]) : [];
    const page = Number(req.query.page) || 0;
    const pageSize = Number(req.query.pageSize) || 10; // for testing; revert to 25
    const sort = (req.query.sort as string | undefined) || defaultSort;
    const sortBy = sort.split(',').map((s) => {
      const sortField = s.trim().split(':');
      return { field: sortField[0].trim(), direction: sortField[1].trim() };
    });

    return {
      query,
      states,
      page,
      pageSize,
      sortBy,
    };
  };

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

  type CSVFileHeader = {
    accessor?: string;
    name: string;
  };

  const fileHeaders: CSVFileHeader[] = [
    { accessor: 'displayName', name: 'USER NAME' },
    { accessor: 'googleEmail', name: 'OPENID' },
    { accessor: 'institutionalEmail', name: 'EMAIL' },
    { accessor: 'lastUpdatedAtUtc', name: 'CHANGED' }, // verify what this value should be
    { accessor: 'primaryAffiliation', name: 'AFFILIATION' },
  ];
  const headerRow: string[] = fileHeaders.map((header) => header.name);

  const convertToCsvRow = (userData: PersonalInfo, lastUpdated: Date) => {
    // File Header	USER NAME	OPENID	EMAIL	CHANGED	AFFILIATION
    // is CHANGED the date the app was last modified, or the date this user was added to the file?
    const dataRow: string[] = fileHeaders.map((header) => {
      if (header.name === 'CHANGED') {
        return lastUpdated.toString(); // not sure about formatting
      } else {
        // if value is missing, add empty string
        return userData[header.accessor as keyof PersonalInfo] || '';
      }
    });
    return dataRow.join(',');
  };

  router.get(
    '/export/approved-users/',
    authFilter([config.auth.REVIEW_SCOPE]),
    wrapAsync(async (req: Request, res: Response) => {
      const params = {
        ...getSearchParams(req, 'appId:asc'),
        states: ['APPROVED'] as State[],
        includeCollaborators: true,
        useCursor: true,
      };
      logger.info(`exporting approved users for all applications`);
      // so here, iterate through apps and write result to file
      // where to do unique call? you would need to get all the results first
      // so, load everything row into a stream, then call unique func
      // then write to file

      let fooNum = 0;
      const docs: any[] = [];
      const getStuff = async (pageNum: number) =>
        await search({ ...params, page: pageNum, useCursor: true }, (req as IRequest).identity);
      // return res.status(200).send(withHeaders);
      // const result = await search(params, (req as IRequest).identity);
      const result = await search(
        { ...params, page: fooNum, useCursor: true },
        (req as IRequest).identity,
      );
      await result
        .on('data', (doc: any) => {
          docs.push(doc);
          fooNum += 1;
        })
        .on('end', () => {
          console.log('Done!');
          console.log(docs.length);
          console.log('foo num: ', fooNum);
        });

      // const readable = new Stream.Readable({
      //   read() {}
      // });

      // res.write is causing: Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
      // res.write(headerRow.concat('\n').join(','));
      // for each approved application, create csv row and push into stream
      // console.log(result);
      const foo = result.items.map((appResult: ApplicationSummary) => {
        const applicantData = convertToCsvRow(appResult.applicant.info, appResult.lastUpdatedAtUtc);
        const collaboratorData =
          appResult.collaborators?.map((collab) =>
            convertToCsvRow(collab, appResult.lastUpdatedAtUtc).concat('\n'),
          ) || [];
        const combined = [...[applicantData], ...collaboratorData].join('\n');
        // res.write(combined);
        return combined;
      });

      // treat as blob to write to a file object
      // then you can name it
      // res.set('Content-Type', 'text/csv');
      // const withHeaders = [headerRow, ...foo].join('\n');
      // readable.push(withHeaders);
      // res.attachment('daco-users.csv');
      // readable.pipe(res);
      return res.status(200).send(foo);
      // return res.status(200).end();
      // return res.status(200).download('/daco-users.csv', 'daco-users.csv');

      // return res.status(200).send(result);
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
