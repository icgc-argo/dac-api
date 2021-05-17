import { Router, Request, Response, RequestHandler } from 'express';


import wrapAsync from '../utils/wrapAsync';
import { create, getById, search, updateFullDocument } from '../domain/service';
import { BadRequest } from '../utils/errors';
import { Identity } from '@overture-stack/ego-token-middleware';
import { Application } from '../domain/interface';
interface IRequest extends Request {
  identity: Identity;
}

const createApplicationsRouter = (authFilter: (scopes: string[]) => RequestHandler) => {
  const router = Router();

  router.post(
    '/applications/',
    authFilter([]),
    wrapAsync(async (req: Request, res: Response) => {
      const app = await create((req as IRequest).identity);
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
        return res.status(404);
      }
      return res.status(200).send(result);
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