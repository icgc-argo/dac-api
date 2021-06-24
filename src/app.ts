/*
 * Copyright (c) 2021 The Ontario Institute for Cancer Research. All rights reserved
 *
 * This program and the accompanying materials are made available under the terms of
 * the GNU Affero General Public License v3.0. You should have received a copy of the
 * GNU Affero General Public License along with this program.
 *  If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import express, { NextFunction, Request, RequestHandler, Response } from 'express';
import bodyParser from 'body-parser';
import * as swaggerUi from 'swagger-ui-express';
import path from 'path';
import yaml from 'yamljs';
import { AppConfig } from './config';
import Auth from '@overture-stack/ego-token-middleware';
import logger from './logger';
import createApplicationsRouter from './routes/applications';
import fileUpload from 'express-fileupload';
import { Storage } from './storage';
import { countriesList } from './utils/constants';
import { Transport, Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
const App = (config: AppConfig,
             storageClient: Storage,
             emailClient: Transporter<SMTPTransport.SentMessageInfo>): express.Express => {
  // Auth middleware
  const noOpReqHandler: RequestHandler = (req, res, next) => {
    logger.warn('calling protected endpoint without auth enabled');
    next();
  };
  const authFilter = config.auth.enabled
    ? Auth(config.auth.jwtKeyUrl, config.auth.jwtKey)
    : (scope: string[]) => {
        return noOpReqHandler;
      };

  const app = express();
  app.set('port', process.env.PORT || 3000);
  app.use(bodyParser.json());
  app.use(fileUpload());
  app.get('/', (req, res) => res.status(200).send('hello world'));
  app.get('/health', (req, res) => {
    const status = dbHealth.status == Status.OK ? 200 : 500;
    const resBody = {
      db: dbHealth,
      version: `${process.env.SVC_VERSION || process.env.npm_package_version}`,
    };
    return res.status(status).send(resBody);
  });

  app.use(createApplicationsRouter(config, authFilter, storageClient, emailClient));
  app.get('/lookups/countries', (req, res) => {
    return res.status(200).send(countriesList);
  });
  const swaggerDoc = yaml.load(path.join(__dirname, './resources/swagger.yaml'));
  swaggerDoc.servers = [{ url: config.basePath }];
  app.use(
    config.openApiPath,
    swaggerUi.serve,
    swaggerUi.setup(swaggerDoc)
  );

  app.use(errorHandler);
  return app;
};

// general catch all error handler
export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction): any => {
  logger.error('error handler received error: ', err);
  if (res.headersSent) {
    logger.debug('error handler skipped');
    return next(err);
  }
  let status: number;
  const customizableMsg = err.message;

  switch (true) {
    case err.name == 'Unauthorized':
      status = 401;
      break;
    case err.name == 'Forbidden':
      status = 403;
      break;
    case err.name == 'BadRequest':
      status = 400;
      break;
    case err.name == 'NotFound':
      status = 404;
      break;
    default:
      status = 500;
  }
  res.status(status).send({ error: err.name, message: customizableMsg });
  next(err);
};

export enum Status {
  OK = '😇',
  UNKNOWN = '🤔',
  ERROR = '😱',
}

export const dbHealth = {
  status: Status.UNKNOWN,
  stautsText: 'N/A',
};

export function setDBStatus(status: Status) {
  if (status == Status.OK) {
    dbHealth.status = Status.OK;
    dbHealth.stautsText = 'OK';
  }
  if (status == Status.UNKNOWN) {
    dbHealth.status = Status.UNKNOWN;
    dbHealth.stautsText = 'UNKNOWN';
  }
  if (status == Status.ERROR) {
    dbHealth.status = Status.ERROR;
    dbHealth.stautsText = 'ERROR';
  }
}

export default App;
