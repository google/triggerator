/**
 * Copyright 2021 Google LLC
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
import _ from 'lodash';
import express from 'express';
import { StatusCodes } from 'http-status-codes';
import logger from './app/logger-buyan';
import {express as bunyan_express} from '@google-cloud/logging-bunyan';
import { EXPECTED_AUDIENCE, HEALTH_CHECK_URL, SECURITY, STATIC_DIR } from './env';
import router from './api';
import { LoginTicket, verifyIdToken, verifyJwtToken } from './app/auth';
import Logger from 'bunyan';

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
logger.info()
export default async function createApp(): Promise<express.Express> {
  const app = express();

  const mw = await bunyan_express.middleware({
    logName: 'Triggerator'
  });
  app.use(mw.mw);
  app.use(express.json());
  const staticFilesDir = path.join(__dirname, STATIC_DIR);
  app.use(express.static(staticFilesDir));
  
  // Add headers allows CORS
  app.use((req, res, next) => {
    // Website you wish to allow to connect
    res.setHeader('Access-Control-Allow-Origin', '*');
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
        logger.info(`[WebApi] Triggered by Cloud Scheduler `, req.header('x-cloudscheduler-jobname'));
        next();
        return;
      }
      let jwtAssertion = req.header('x-goog-iap-jwt-assertion');
      if (!jwtAssertion) {
        console.log(JSON.stringify(req.headers, null, 2));
        console.error(`[WebApi] IAP jwt assertion failed: no 'x-goog-iap-jwt-assertion' header`);
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
        console.log(`[WebApi] User verified: email=${email}, id=${userId}`);
        req.user = email;
        req.ticket = ticket;
      } catch (e) {
        console.error(`[WebApi] IAP jwt verification failed: `, e.message);
        console.error(e);
        res.status(StatusCodes.UNAUTHORIZED).send({error: `IAP JWT token verification failed (${e.message}), please contact your system administator`});
        return;
      }
      next();
    });
  } else if (SECURITY === 'CLIENT') {
    app.use(async (req: express.Request, res: express.Response, next) => {
      if (req.headers.authorization) {
        try {
          let payload = await verifyIdToken(req.headers.authorization);
          if (payload) {
            req.user = payload.email;
            // TODO: we can use auth by user instead of serrvice-account:
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
  
  // catch all incorrect api request
  router.get('/api/*', (req: express.Request, res: express.Response) => {
    res.sendStatus(StatusCodes.NOT_FOUND);
  });
  
  app.get('/_ah/health', (req, res) => {
    res.type('text').send('ok');
  });
  
  app.get('/*', function (req, res) {
    res.sendFile('index.html', { root:  staticFilesDir });
  });

  logger.debug(`Express app created`);
  return app;  
}

//export = app;