import express from 'express';
import bodyParser from 'body-parser';
import Controller from './controller';
import ConfigService from './config-service';
import { google } from 'googleapis';
import FeedService from './feed-service';

const app = express();
app.use(bodyParser.json());

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

  console.log(`Incomming request with payload: '${payload}'.`);

  if (!payload) {
    const msg = 'invalid Pub/Sub message format: missing spreadsheet id';
    console.error(`error: ${msg}`);
    res.status(400).send(`Bad Request: ${msg}`);
    return;
  }

  // TODO: add all other scopes (DV360 at least)
  const auth = await new google.auth.GoogleAuth({
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
    ]
  });
  google.options({
    auth: auth
  });

  //const campaignId = argv.campaign || '3242703';
  //let sdfVersion = argv.sdf_version || process.env.SDF_VERSION || '5.1';
  //test(campaignId, sdfVersion);
  let controller = new Controller(new ConfigService(payload), new FeedService());
  await controller.run();

  res.status(204).send();
});

//module.exports = app;

export = app;