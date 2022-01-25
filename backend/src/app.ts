/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import path from 'path';
import express from 'express';
import { StatusCodes } from 'http-status-codes';
import logger from './app/logger-winston';
import {express as winston_express} from '@google-cloud/logging-winston';
import { EXPECTED_AUDIENCE, HEALTH_CHECK_URL, SECURITY, STATIC_DIR } from './env';
import router from './api';
import { LoginTicket, verifyIdToken, verifyJwtToken } from './app/auth';
import {Logger} from 'winston';

// Extend Express' Request interface with User field
declare global {
  namespace Express {
    interface Request {
      user?: string | null;
      ticket?: LoginTicket | null;
      log: Logger;
    }
  }
}

export default async function createApp(): Promise<express.Express> {
  const app = express();

  const mw = await winston_express.makeMiddleware(
    logger,
    //logName: 'Triggerator'
  );
  app.use(mw);
  app.use(express.json());
  const staticFilesDir = path.join(__dirname, STATIC_DIR);
  app.use(express.static(staticFilesDir, { lastModified: false}));

  // Add headers allows CORS
  app.use((req, res, next) => {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.removeHeader('Last-Modified');
    // Pass to next layer of middleware
    next();
  });

  if (SECURITY === 'IAP') {
    // Check authorization header from IAP to make sure all requests are authenticated
    app.use(async (req: express.Request, res: express.Response, next) => {
      // ignore checking for health check heartbeat
      if (req.url.startsWith(HEALTH_CHECK_URL)) {
        next();
      }
      if (req.header('x-cloudscheduler') === 'true') {
        // TODO: instead we should validate OidcToken from Authorization header,
        // but it's not supported by calls from Scheduler, we need to use Pub/Sub with auth.
        // claim = id_token.verify_oauth2_token(token, requests.Request())
        logger.info(`[WebApi] Triggered by Cloud Scheduler, job=` + req.header('x-cloudscheduler-jobname'));
        next();
        return;
      }
      let jwtAssertion = req.header('x-goog-iap-jwt-assertion');
      if (!jwtAssertion) {
        req.log.warn(JSON.stringify(req.headers, null, 2), {headers: req.headers});
        req.log.error(`[WebApi] IAP jwt assertion failed: no 'x-goog-iap-jwt-assertion' header`);
        // res.status(401).send('No x-goog-iap-jwt-assertion header found');
        next();
        return;
      }
      if (!EXPECTED_AUDIENCE) {
        next();
        return;
      }
      try {
        let ticket = await verifyJwtToken(jwtAssertion, EXPECTED_AUDIENCE);
        const userId = ticket.getUserId();
        const email = ticket.getPayload()?.email;
        req.log.info(`[WebApi] User verified: email=${email}, id=${userId}`);
        req.user = email;
        req.ticket = ticket;
      } catch (e) {
        req.log.error(`[WebApi] IAP jwt verification failed: ${e.message}`, e);
        res.status(StatusCodes.UNAUTHORIZED).send({error: `IAP JWT token verification failed (${e.message}), please contact your system administator`});
        return;
      }
      next();
    });
  } else if (SECURITY === 'CLIENT') {
    // client-side auth, not really used currently
    app.use(async (req: express.Request, res: express.Response, next) => {
      if (req.headers.authorization) {
        try {
          let payload = await verifyIdToken(req.headers.authorization);
          if (payload) {
            req.user = payload.email;
            // TODO: we can use auth by user instead of service-account:
            // setupOAuth(req.headers.authorization);
          }
        } catch (e) {
          next(e);
          return;
        }
      }
      next();
    });
  }

  app.use('/api/v1', router);

  // global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!err.logged)
      req.log.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: err.message });
  });

  // catch all incorrect api request
  router.get('/api/*', (req: express.Request, res: express.Response) => {
    res.sendStatus(StatusCodes.NOT_FOUND);
  });

  if (HEALTH_CHECK_URL) {
    app.get(HEALTH_CHECK_URL, (req, res) => {
      res.type('text').send('ok');
    });
  }

  // support of client-side routing in SPA apps (all routes that are not api lead to root)
  app.get('/*', function (req, res) {
    res.sendFile('index.html', { root:  staticFilesDir });
  });

  logger.debug(`Express app created`);
  return app;
}

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});