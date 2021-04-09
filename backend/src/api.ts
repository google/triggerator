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
import _, { result } from 'lodash';
import express from 'express';
import { StatusCodes } from 'http-status-codes';
import { Storage } from '@google-cloud/storage';
import { google } from 'googleapis';
import ConfigService from './app/config-service';
import GoogleDriveFacade from './app/google-drive-facade';
import DV360Facade from './app/dv360-facade';
import FeedService from './app/feed-service';
import { RuleEvaluator } from './app/rule-engine';
import SdfController from './app/sdf-controller';
import { difference, parseBool, parseDate } from './app/utils';
import { GAE_LOCATION, IS_GAE, MASTER_SPREADSHEET } from './env';
import { Config, JobInfo } from './types/config';
import RuleEngineController from './app/rule-engine-controller';
import SchedulerService from './app/cloud-scheduler-service';

let router = express.Router();

router.get('/apps/list', async (req: express.Request, res: express.Response) => {
  let masterSpreadsheetId = MASTER_SPREADSHEET;
  if (!masterSpreadsheetId) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: "Server hasn't been fully configured, master spreadsheet id is missing" });
    return;
  }
  let cfgSvc = new ConfigService();
  try {
    let apps = await cfgSvc.loadApplicationList(masterSpreadsheetId);
    console.log(`[WebApi] Fetched app list: ` + JSON.stringify(apps));
    res.status(200).send(apps);
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: e.message });
  }
});

router.post('/apps/create', async (req: express.Request, res: express.Response) => {
  let cfgSvc = new ConfigService();
  try {
    let name = req.body.name;
    let appId = req.body.appId;
    console.log(`[WebApi] Creating an app (name:${name}, id: ${appId})`);
    let result = await cfgSvc.createApplication(MASTER_SPREADSHEET, req.user, name, appId);
    res.status(200).send(result);
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: e.message });
  }
});

router.post('/apps/:id/delete', async (req: express.Request, res: express.Response) => {
  let appId = req.params.id;
  let cfgSvc = new ConfigService();
  try {
    console.log(`[WebApi] Deleting an app ${appId}`);
    let result = await cfgSvc.deleteApplication(MASTER_SPREADSHEET, appId);
    res.status(200).send(result);
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: e.message });
  }
});

router.get('/config/:id', async (req: express.Request, res: express.Response) => {
  let configId = <string>req.params.id;
  console.log(`[WebApi] Fetching configuration from ${configId} spreadsheet`);
  let cfgSvc = new ConfigService();
  try {
    let config: Config = await cfgSvc.loadConfiguration(configId);
    console.log(`[WebApi] Loaded configuration: \n` + JSON.stringify(config));
    res.status(200).send(config);
  } catch (e) {
    console.error(e);
    res.status(500).send({ error: e.message });
  }
});

router.post('/config/:id', async (req: express.Request, res: express.Response) => {
  let cfgSvc = new ConfigService();
  let config = req.body;
  let id = req.params.id;
  if (!config || _.isEmpty(config)) {
    res.status(StatusCodes.BAD_REQUEST).send({ error: 'body is empty' });
    return;
  }
  if (!id) {
    res.status(StatusCodes.BAD_REQUEST).send({ error: 'Configuration id is empty' });
    return;
  }
  try {
    if (id === 'new') {
      // TODO: a new configuration
    } else {
      // updating an existing configuratino
      cfgSvc.updateConfiguration(id, config);
      res.sendStatus(StatusCodes.OK);
    }
  } catch (e) {
    console.error(e);
    res.status(e.httpStatus || StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

router.post('/config/:id/stream', async (req: express.Request, res: express.Response) => {
  let id = req.params.id;
  if (!id) {
    res.status(StatusCodes.BAD_REQUEST).send({ error: 'Configuration id is empty' });
    return;
  }
  let updated = req.body.updated;
  if (!updated) {
    res.status(StatusCodes.BAD_REQUEST).send({ error: 'Updated data is empty' });
    return;
  }
  let original = req.body.original;
  let diff: Config;
  if (original)
    diff = difference(updated, original);
  else
    diff = updated;
  //console.log('updated:\n' + JSON.stringify(updated));
  //console.log('original:\n' + JSON.stringify(original));
  console.log(`[WebApi] Updating configuration ${id} with diff:\n` + JSON.stringify(diff));
  let cfgSvc = new ConfigService();
  try {
    let updatedCells = await cfgSvc.applyChanges(id, diff);
    res.status(StatusCodes.OK).send({ updatedCells });
  } catch (e) {
    console.error(`[WebApi] Updating configuration failed: `, e.message);
    console.error(e);
    res.status(e.httpStatus || StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

async function getConfig(configId: string, res: express.Response) {
  let cfgSvc = new ConfigService();
  let config: Config;
  try {
    config = await cfgSvc.loadConfiguration(configId);
  } catch (e) {
    console.error(e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
    return;
  }
  return config;
}

router.get('/config/:id/feeds/_all_', async (req: express.Request, res: express.Response) => {
  let config = await getConfig(<string>req.params.id, res);
  if (!config) return;
  if (!config.feedInfo || !config.feedInfo.feeds || !config.feedInfo.feeds.length) {
    res.status(StatusCodes.NO_CONTENT).send({ message: "Configuration doesn't contain any feeds" });
    return;
  }
  console.log(`[WebApi][GenerateSdf] Loading joined feeds data`);
  let feedSvc = new FeedService();
  try {
    let data = await feedSvc.loadAll(config.feedInfo);
    let values = data.recordSet.values;
    let effective_rules = [];
    if (config.rules && parseBool(req.query.evaluateRules)) {
      let ruleEvaluator = new RuleEvaluator();
      for (let rowNo = 0; rowNo < data.rowCount; rowNo++) {
        effective_rules[rowNo] = ruleEvaluator.getActiveRule(config.rules, data.getRow(rowNo))?.name || null;
      }
    }
    res.send({ data: values, effeective_rules: effective_rules });
  } catch (e) {
    console.error(`[WebApi] Feeds failed to load: `, e.message);
    console.error(e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

router.get('/config/:id/feeds/:feed', async (req: express.Request, res: express.Response) => {
  let config = await getConfig(<string>req.params.id, res);
  if (!config) return;
  if (!config.feedInfo || !config.feedInfo.feeds || !config.feedInfo.feeds.length) {
    res.status(StatusCodes.NO_CONTENT).send({ message: "Configuration doesn't contain any feeds" });
    return;
  }
  const feedName = <string>req.params.feed;
  let feed = config.feedInfo.feeds.find((f) => f.name === feedName);
  if (!feed) {
    res.status(StatusCodes.BAD_REQUEST).send({ error: `Unknown feed '${feedName}'` });
    return;
  }
  console.log(`[WebApi][GenerateSdf] Loading feed data '${feedName}'`);
  let feedSvc = new FeedService();
  try {
    let data = await feedSvc.loadFeed(feed);
    res.send(data.recordSet.values);
  } catch (e) {
    console.error(`[WebApi] Feed ${feedName} failed to load: `, e.message);
    console.error(e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

router.get('/config/:id/rules/validate', async (req: express.Request, res: express.Response) => {
  let ruleEvaluator = new RuleEvaluator();
  let config = await getConfig(<string>req.params.id, res);
  if (!config) return;
  if (!config.rules || !config.rules.length) {
    res.sendStatus(StatusCodes.NO_CONTENT);
    return;
  }
  let result = config.rules?.map(rule => ({ [rule.name]: ruleEvaluator.validateRule(rule) }));
  res.send(result);
});

router.get('/config/:id/sdf/download', (req: express.Request, res: express.Response, next) => {
  let filename = <string>req.query.file;
  if (!filename) {
    res.status(StatusCodes.BAD_REQUEST).send({ error: 'file parameter wasn\'t specified' });
    return;
  }

  let filepath = path.resolve(path.join('./.tmp', filename));
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.download(filepath, (err) => {
    if (err) {
      console.error(`[WebApi][GenerateSdf] Sending SDF file ${filepath} failed: ${err.message}`);
      console.error(err);
      return;
    }
  });
});

router.get('/config/:id/sdf/generate', async (req: express.Request, res: express.Response) => {
  let appId = <string>req.params.id;
  console.log(`[WebApi] Generating SDF for configuration ${appId}`);

  let controller = new SdfController(
    new ConfigService(), new RuleEvaluator(), new FeedService(),
    // TODO: remove { useLocalCache: true }
    new DV360Facade({ useLocalCache: true }));
  let filepath: string;
  try {
    filepath = await controller.generateSdf(appId, {
      update: parseBool(req.query.update),
      autoActivate: parseBool(req.query.autoActivate),
      startDate: req.query.startDate ? parseDate(req.query.startDate) : undefined,
      endDate: req.query.endDate ? parseDate(req.query.endDate) : undefined
    });
  } catch (e) {
    console.error(`[WebApi][ Generating SDF failed: ${e.message}`);
    console.error(e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message, details: JSON.stringify(e) });
    return;
  }

  res.download(filepath, async (err) => {
    if (err) {
      console.error(`[WebApi][GenerateSdf] Sending SDF file ${filepath} failed: ${err.message}`);
      console.error(err);
      return;
    }
    let config = controller.config!;
    // copy generated SDF (and already downloaded) to some place (GCS or gDrive)
    if (config.dv360Template?.destination_folder) {
      let dest = config.dv360Template?.destination_folder;
      if (dest.startsWith('gs://')) {
        uploadFileToGCS(filepath, dest).catch(e => {
          console.error(`[WebApi][GenerateSdf] Uploading SDF file ${filepath} to GCS path ${dest} failed: ${e.message}`);
          console.error(e);
        }).then(() => {
          console.log(`[WebApi][GenerateSdf] Generated SDF file ${filepath} successfully uploaded to GCS '${dest}'`);
        });
      } else if (dest.startsWith('drive://')) {
        try {
          await GoogleDriveFacade.uploadFile(filepath, dest);
          console.log(`[WebApi][GenerateSdf] Generated SDF file ${filepath} successfully uploaded to Google Drive folder '${dest}'`)
        } catch (e) {
          console.error(`[WebApi][GenerateSdf] Uploading SDF file ${filepath} to Google Drive path ${dest} failed: ${e.message}`);
          console.error(e);
        }
      }
    }
  });
});

/**
 * Copies a local file to Google Cloud Storage bucket.
 * @param filePath Local file path
 * @param destStorageUrl Destination path on GCS in format gs://bucket_name/folderpath
 */
async function uploadFileToGCS(filePath: string, destStorageUrl: string) {
  const storage = new Storage();
  let parsed = new URL(destStorageUrl);
  let bucket = parsed.hostname;
  let filename = parsed.pathname.substring(1);
  await storage.bucket(bucket).upload(filePath, {
    destination: filename,
  });
}

router.get('/config/:id/schedule', async (req: express.Request, res: express.Response, next) => {
  let appId = <string>req.params.id;

  try {
    let jobName = await SchedulerService.getJobName(appId);
    let jobInfo = await SchedulerService.getJob(jobName);
    if (jobInfo === null) {
      jobInfo = { enable: false, schedule: undefined, timeZone: undefined };
    }
    res.send(jobInfo);
  } catch (e) {
    console.error(e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

router.post('/config/:id/schedule/edit', async (req: express.Request, res: express.Response, next) => {
  let appId = <string>req.params.id;
  let jobInfo = <JobInfo>req.body;
  console.log(`[WebApi] Updating schedule for configuration ${appId}`);
  try {
    // TODO: should we pass a controller's URL (/engine/:id/run)
    await SchedulerService.updateJob(appId, jobInfo);
    res.send({ status: 'OK' });
  } catch (e) {
    console.error(`[WebApi] Job creation failed: `, e.message);
    console.error(e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }

  /*
    {
        "name": "projects/triggerator-sd/locations/europe-west1/jobs/1KkKLHlxBEEhdLsxjK9RXSh9I7eO6bJinxZsi1XgjsBI",
        "appEngineHttpTarget": {
            "httpMethod": "POST",
            "appEngineRouting": {
                "host": "triggerator-sd.ew.r.appspot.com"
            },
            "relativeUri": "/api/v1/config/1KkKLHlxBEEhdLsxjK9RXSh9I7eO6bJinxZsi1XgjsBI/schedule/edit",
            "headers": {
                "Content-Length": "18",
                "User-Agent": "AppEngine-Google; (+http://code.google.com/appengine)",
                "Content-Type": "application/octet-stream"
            },
            "body": "ewplbmFibGVkOiBmYWxzZQp9"
        },
        "userUpdateTime": "2021-04-01T17:22:05Z",
        "state": "ENABLED",
        "status": {},
        "scheduleTime": "2021-04-02T17:00:00.580664Z",
        "lastAttemptTime": "2021-04-02T12:00:00.486192Z",
        "schedule": "0 * /5 * * *",
        "timeZone": "Europe/Moscow"
    }
 */
});

/**
 * Endpoint for automated running engine execution (from Cloud Scheduler)
 */
router.post('/engine/:id/run', async (req: express.Request, res: express.Response, next) => {
  let appId = <string>req.params.id;
  let controller = new RuleEngineController(
    new ConfigService(),
    new RuleEvaluator(),
    new FeedService(),
    // TODO: remove { useLocalCache: true }
    new DV360Facade({ useLocalCache: true })
  );
  try {
    await controller.run(appId, {sendNotificationsOnError: true});
    res.status(StatusCodes.OK).send(result);
  } catch (e) {
    console.error(`[WebApi] Execution (${appId}) failed: `, e.message);
    console.error(e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

/**
 * Endpoint for manual running engine execution (from the client) with streaming logs back to client.
 */
router.get('/engine/:id/run/stream', async (req: express.Request, res: express.Response) => {
  let started = new Date();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-control": "no-cache"
  });
  let originalLog = console.log;  
  console.log = (...args: any[]) => {
    originalLog.apply(console, args);
    let str = args.join("");
    res.write(`data: ${str}\n\n`);
  }

  let appId = <string>req.params.id;
  let controller = new RuleEngineController(
    new ConfigService(),
    new RuleEvaluator(),
    new FeedService(),
    // TODO: remove { useLocalCache: true }
    new DV360Facade({ useLocalCache: true })
  );
  try {
    await controller.run(appId, {sendNotificationsOnError: false});
    console.log = originalLog;
    res.write('data: Done. Elapsed: ' + (new Date().valueOf() - started.valueOf()) + '\n\n');
    res.end();
    //res.status(StatusCodes.OK).send(result);
  } catch (e) {
    console.error(`[WebApi] Execution (${appId}) failed: `, e.message);
    console.log = originalLog;
    console.error(e);
    res.write(`data: error:${e.message}\n\n`);
    res.end();
    //res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

router.get('/settings', async (req: express.Request, res: express.Response) => {
  let projectId = await google.auth.getProjectId();
  
  let settings = {
    "Master Spreadsheet": MASTER_SPREADSHEET,
    "Is GAE": IS_GAE,
    "GCP Project Id": projectId,
    user: req.user,
    env: {
      GAE_APPLICATION: process.env.GAE_APPLICATION,// 	The ID of your App Engine application. This ID is prefixed with 'region code~' such as 'e~' for applications deployed in Europe.
      GAE_DEPLOYMENT_ID: process.env.GAE_DEPLOYMENT_ID,// 	The ID of the current deployment.
      GAE_ENV: process.env.GAE_ENV, // 	The App Engine environment. Set to standard.
      GAE_INSTANCE: process.env.GAE_INSTANCE, // 	The ID of the instance on which your service is currently running.
      GAE_MEMORY_MB: process.env.GAE_MEMORY_MB, // 	The amount of memory available to the application process, in MB.
      GAE_RUNTIME: process.env.GAE_RUNTIME, // 	The runtime specified in your app.yaml file.
      GAE_SERVICE: process.env.GAE_SERVICE, // 	The service name specified in your app.yaml file. If no service name is specified, it is set to default.
      GAE_VERSION: process.env.GAE_VERSION, // 	The current version label of your service.
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT
    }
  };
  res.send({settings});
});

export = router;