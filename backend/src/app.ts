import path from 'path';
import _ from 'lodash';
import express from 'express';
import logger from 'morgan';
import { StatusCodes } from 'http-status-codes';
import { EXPECTED_AUDIENCE, HEALTH_CHECK_URL, SECURITY, STATIC_DIR } from './env';
import router from './api';
import RuleEngineController from './app/rule-engine-controller';
import ConfigService from './app/config-service';
import FeedService from './app/feed-service';
import DV360Facade from './app/dv360-facade';
import { RuleEvaluator } from './app/rule-engine';
import { Config } from './types/config';
import { LoginTicket, verifyIdToken, verifyJwtToken } from './app/auth';


const app = express();
app.use(logger('dev'));
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
// Extend Express' Request interface with User field
declare global {
  namespace Express {
    interface Request {
      user?: string | null;
      ticket?: LoginTicket | null;
    }
  }
}

if (SECURITY === 'IAP') {
  // Check authorization header from IAP to make sure all requests are authenticated
  app.use(async (req: express.Request, res: express.Response, next) => {
    // ignore checking for health check heartbeat
    if (req.url.startsWith(HEALTH_CHECK_URL)) {
      next();
    }
    if (req.header('x-cloudscheduler') === 'true') {
      console.log(`[WebApi] Triggered by Cloud Scheduler `, req.header('x-cloudscheduler-jobname'));
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
      next(e);
      return;
    }
    // TODO: where is a tiket (to use with setupOAuth)?
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

// Handle pub/sub event from Cloud Scheduler to run execution (obsolete, not used)
app.post('/', async (req: express.Request, res: express.Response) => {
  if (!req.body) {
    const msg = 'no Pub/Sub message received';
    console.error(`error: ${msg}`);
    res.status(400).send(`Bad Request: ${msg}`);
    return;
  }
  if (!req.body.message) {
    const msg = 'invalid Pub/Sub message format';
    console.error(`error: ${msg}`);
    res.status(400).send(`Bad Request: ${msg}`);
    return;
  }

  const pubSubMessage = req.body.message;
  const payload = pubSubMessage.data
    ? Buffer.from(pubSubMessage.data, 'base64').toString().trim()
    : null;

  console.log(`[WebApi] Incomming Pub/Sub with payload: '${payload}'.`);

  if (!payload) {
    const msg = 'invalid Pub/Sub message format: missing spreadsheet id';
    console.error(`error: ${msg}`);
    res.status(400).send(`Bad Request: ${msg}`);
    return;
  }

  let controller = new RuleEngineController(
    new ConfigService(),
    new RuleEvaluator(),
    new FeedService(),
    new DV360Facade()
  );
  await controller.run(payload, {sendNotificationsOnError: true});

  res.status(204).send();
});

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

export = app;