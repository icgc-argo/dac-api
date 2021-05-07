import { Router, Request, Response, RequestHandler, NextFunction } from 'express';


import { AppConfig } from '../config';
import wrapAsync from '../utils/wrapAsync';
import { create, getById, search } from '../domain/service';
import { BadRequest } from '../utils/errors';
import { Identity } from '../utils/identity';

interface IRequest extends Request {
  identity: Identity;
}

const createApplicationsRouter = (config: AppConfig, authFilter: (scopes: string[]) => RequestHandler, identityFilter: RequestHandler) => {
  const router = Router();

  router.post(
    '/applications/',
    authFilter([
      config.auth.REVIEW_SCOPE,
      config.auth.ADMIN_SCOPE
    ]),
    identityFilter,
    wrapAsync(async (req: Request, res: Response) => {
      const app = await create((req as IRequest).identity);
      return res.status(200).send(app);
    }),
  );

  router.get(
    '/applications/',
    authFilter([
      config.auth.REVIEW_SCOPE,
      config.auth.ADMIN_SCOPE
    ]),
    identityFilter,
    wrapAsync(async (req: Request, res: Response) => {
      const app = await search((req as IRequest).identity);
      return res.status(200).send(app);
    }),
  );

  router.get(
    '/applications/:id',
    authFilter([
      config.auth.REVIEW_SCOPE,
      config.auth.ADMIN_SCOPE
    ]),
    identityFilter,
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

  return router;
};

function validateId(id: string) {
  if (!id) {
    throw new BadRequest('id is required');
  }
  if (!id.startsWith('DACO-')) {
    throw new BadRequest('Invalid id');
  }
  const numericId = id.replace('DACO-', '');
  if (Number(numericId) == NaN) {
    throw new BadRequest('Invalid id');
  }
  return Number(numericId);
}


export default createApplicationsRouter;