import { Router, Request, Response, RequestHandler } from 'express';


import wrapAsync from '../utils/wrapAsync';
import { create, createCollaborator, deleteApp, deleteCollaborator, getById, search, updateCollaborator, updateFullDocument, updatePartial } from '../domain/service';
import { BadRequest } from '../utils/errors';
import { Identity } from '@overture-stack/ego-token-middleware';
import { Application } from '../domain/interface';
import { AppConfig } from '../config';
interface IRequest extends Request {
  identity: Identity;
}

const createApplicationsRouter = (config: AppConfig, authFilter: (scopes: string[]) => RequestHandler) => {
  const router = Router();

  router.post(
    '/applications/',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
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
      const app = await createCollaborator(validatedId, collaborator, (req as IRequest).identity);
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
      const app = await deleteCollaborator(validatedId, collaboratorId, (req as IRequest).identity);
      return res.status(200).send(app);
    }),
  );

  router.get(
    '/applications/',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const query = req.query.query as string | undefined || '';
      const states = req.query.states ? (req.query.states as string).split(',') : [];
      const page = Number(req.query.page) || 0;
      const pageSize = Number(req.query.pageSize) || 25;
      const sort = req.query.sort as string | undefined || 'state:desc';
      const sortBy = sort.split(',').map(s => {
        const sortField = s.trim().split(':');
        return { field: sortField[0].trim(), direction: sortField[1].trim() };
      });

      const params = {
        query,
        states,
        page,
        pageSize,
        sort,
        sortBy
      };

      const app = await search(params, (req as IRequest).identity);
      return res.status(200).send(app);
    }),
  );

  router.get(
    '/applications/:id',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      const result = await getById(validatedId, (req as IRequest).identity);
      if (!result) {
        return res.status(404).send();
      }
      return res.status(200).send(result);
    }),
  );

  router.delete(
    '/applications/:id',
    authFilter([ config.auth.REVIEW_SCOPE ]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      await deleteApp(validatedId, (req as IRequest).identity);
      return res.status(200).end();
    }),
  );

  router.put(
    '/applications/:id',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      const app = req.body as Application;
      await updateFullDocument(app, (req as IRequest).identity);
      return res.status(200).send();
    }),
  );

  router.patch(
    '/applications/:id',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      const validatedId = validateId(id);
      const app = req.body as Application;
      app.appId = id;
      const updated = await updatePartial(app, (req as IRequest).identity);
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


export default createApplicationsRouter;