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
import fs from 'fs';
import _ from 'lodash';
import { Writable } from 'stream';
import express from 'express';
import { StatusCodes } from 'http-status-codes';
import { google } from 'googleapis';
import winston from 'winston';
import * as logging_winston from '@google-cloud/logging-winston';
import { getTempDir, IS_GAE, MAILER_CONFIG, MASTER_SPREADSHEET } from './env';
import ConfigService from './app/config-service';
import { uploadFileToGCS } from './app/cloud-storage';
import GoogleDriveFacade from './app/google-drive-facade';
import DV360Facade, { DV360FacadeOptions } from './app/dv360-facade';
import FeedService from './app/feed-service';
import { RuleEvaluator } from './app/rule-engine';
import SdfController from './app/sdf-controller';
import { difference, getCurrentDateTimestamp, parseBool, parseDate, parseString } from './app/utils';
import { AppList, Config, JobInfo } from './types/config';
import RuleEngineController from './app/rule-engine-controller';
import SchedulerService from './app/cloud-scheduler-service';
import { sendEmail } from './app/email-notifier';
import { Logger } from './types/logger';
import { v4 as uuidv4 } from 'uuid';
import ConfigValidator from './app/config-validator';
import ReportService from './app/report-service';
import { getProjectId } from './app/cloud-utils';

let router = express.Router();

const dv_options: DV360FacadeOptions = { useLocalCache: true };
if (process.env.NODE_ENV === "production") {
  // disable caching in prod
  dv_options.useLocalCache = false;
}

router.get('/apps/list', async (req: express.Request, res: express.Response, next) => {
  let masterSpreadsheetId = MASTER_SPREADSHEET;
  if (!masterSpreadsheetId) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: "Server hasn't been fully configured, master spreadsheet id is missing" });
    return;
  }
  let cfgSvc = new ConfigService(req.log);
  try {
    let apps: AppList = await cfgSvc.loadApplicationList(masterSpreadsheetId);
    req.log.info(`Fetched app list: ` + JSON.stringify(apps), { result: apps, component: 'WebApi' });
    res.status(200).send(apps);
  } catch (e) {
    next(e);
  }
});

router.post('/apps/create', async (req: express.Request, res: express.Response, next) => {
  let cfgSvc = new ConfigService(req.log);
  try {
    let name = req.body.name;
    let appId = req.body.appId;
    req.log.info(`[WebApi] Creating an app (name:${name}, id: ${appId})`);
    let result = await cfgSvc.createApplication(MASTER_SPREADSHEET, req.user, name, appId);
    res.status(200).send(result);
  } catch (e) {
    next(e);
  }
});

router.post('/apps/:id/delete', async (req: express.Request, res: express.Response, next) => {
  let appId = req.params.id;
  let cfgSvc = new ConfigService(req.log);
  try {
    let result = await cfgSvc.deleteApplication(MASTER_SPREADSHEET, appId);
    res.status(200).send(result);
  } catch (e) {
    next(e);
  }
});

router.post('/apps/:id/clone', async (req: express.Request, res: express.Response, next) => {
  let appId = req.params.id;
  let cfgSvc = new ConfigService(req.log);
  try {
    let result = await cfgSvc.cloneApplication(MASTER_SPREADSHEET, req.user, appId);
    res.status(200).send(result);
  } catch (e) {
    next(e);
  }
});

router.get('/config/:id', async (req: express.Request, res: express.Response, next) => {
  let configId = <string>req.params.id;
  req.log.info(`[WebApi] Fetching configuration from ${configId} spreadsheet`);
  let cfgSvc = new ConfigService(req.log);
  try {
    let config: Config = await cfgSvc.loadConfiguration(configId);
    req.log.info(`[WebApi] Loaded configuration: \n` + JSON.stringify(config), { config });
    res.status(200).send(config);
  } catch (e) {
    next(e);
  }
});

router.post('/config/:id', async (req: express.Request, res: express.Response, next) => {
  let cfgSvc = new ConfigService(req.log);
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
    // updating an existing configuratino
    cfgSvc.updateConfiguration(id, config);
    res.sendStatus(StatusCodes.OK);
  } catch (e) {
    next(e);
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
  //console.log(`[WebApi] Updating configuration ${id} with diff:\n` + JSON.stringify(diff));
  let cfgSvc = new ConfigService(req.log);
  try {
    let updatedCells = await cfgSvc.applyChanges(id, diff);
    res.status(StatusCodes.OK).send({ updatedCells });
  } catch (e) {
    if (!e.logged) {
      req.log.error(`[WebApi] Updating configuration failed: ${e.message}`, e);
    }
    res.status(e.httpStatus || StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

async function getConfig(logger: Logger, configId: string, res: express.Response) {
  let cfgSvc = new ConfigService(logger);
  let config: Config;
  try {
    config = await cfgSvc.loadConfiguration(configId);
  } catch (e) {
    if (!e.logged)
      logger.error(e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
    return;
  }
  return config;
}
async function trackExecutionStatus(logger: Logger, appId: string, status: string) {
  let cfgSvc = new ConfigService(logger);
  await cfgSvc.trackExecution(MASTER_SPREADSHEET, appId, status);
}

router.get('/config/:id/feeds/_all_', async (req: express.Request, res: express.Response) => {
  let config = await getConfig(req.log, <string>req.params.id, res);
  if (!config) return;
  if (!config.feedInfo || !config.feedInfo.feeds || !config.feedInfo.feeds.length) {
    res.status(StatusCodes.NO_CONTENT).send({ message: "Configuration doesn't contain any feeds" });
    return;
  }
  let errors = ConfigValidator.validateFeeds(config.feedInfo!);
  if (errors.length) {
    const err = new Error(`There are errors in configuration: ` +
      errors.map(e => e.message).join(', \n')
    );
    req.log.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: err.message });
    return;
  }
  req.log.info(`[WebApi][GenerateSdf] Loading joined feeds data`);
  let feedSvc = new FeedService(req.log);
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
    if (!e.logged)
      req.log.error(`[WebApi] Feeds failed to load: ${e.message}`, e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

router.get('/config/:id/feeds/:feed', async (req: express.Request, res: express.Response) => {
  let config = await getConfig(req.log, <string>req.params.id, res);
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
  req.log.info(`[WebApi][GenerateSdf] Loading feed data '${feedName}'`);
  let feedSvc = new FeedService(req.log);
  try {
    let data = await feedSvc.loadFeed(feed);
    res.send(data.recordSet.values);
  } catch (e) {
    if (!e.logged)
      req.log.error(`[WebApi] Feed ${feedName} failed to load: ${e.message}`, e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

router.get('/config/:id/rules/validate', async (req: express.Request, res: express.Response) => {
  let ruleEvaluator = new RuleEvaluator();
  let config = await getConfig(req.log, <string>req.params.id, res);
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

  let filepath = path.resolve(path.join(getTempDir(), filename));
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.download(filepath, (err) => {
    if (err) {
      req.log.error(`[WebApi][GenerateSdf] Sending SDF file ${filepath} failed: ${err.message}`, err);
      return;
    }
  });
});

router.get('/config/:id/sdf/generate', async (req: express.Request, res: express.Response) => {
  let appId = <string>req.params.id;
  const logger = req.log;
  logger.info(`[WebApi] Generating SDF for configuration ${appId}`);

  let controller = new SdfController(
    logger,
    new ConfigService(logger),
    new RuleEvaluator(),
    new FeedService(logger),
    new DV360Facade(logger, dv_options));
  let filepath: string;
  try {
    filepath = await controller.generateSdf(appId, {
      update: parseBool(req.query.update),
      autoActivate: parseBool(req.query.autoActivate),
      startDate: req.query.startDate ? parseDate(req.query.startDate) : undefined,
      endDate: req.query.endDate ? parseDate(req.query.endDate) : undefined
    });
  } catch (e) {
    if (!e.logged)
      logger.error(`[WebApi][ Generating SDF failed: ${e.message}`, e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message, details: JSON.stringify(e) });
    return;
  }

  res.download(filepath, async (err) => {
    if (err) {
      req.log.error(`[WebApi][GenerateSdf] Sending SDF file ${filepath} failed: ${err.message}`, err);
      return;
    }
    let config = controller.config!;
    // copy generated SDF (and already downloaded) to some place (GCS or gDrive)
    if (config.dv360Template?.destination_folder) {
      let dest = config.dv360Template?.destination_folder;
      if (dest.startsWith('gs://')) {
        uploadFileToGCS(filepath, dest).catch(e => {
          req.log.error(`[WebApi][GenerateSdf] Uploading SDF file ${filepath} to GCS path ${dest} failed: ${e.message}`, e);
        }).then(() => {
          req.log.info(`[WebApi][GenerateSdf] Generated SDF file ${filepath} successfully uploaded to GCS '${dest}'`);
        });
      } else if (dest.startsWith('drive://')) {
        try {
          await GoogleDriveFacade.uploadFile(filepath, dest);
          req.log.info(`[WebApi][GenerateSdf] Generated SDF file ${filepath} successfully uploaded to Google Drive folder '${dest}'`)
        } catch (e) {
          req.log.error(`[WebApi][GenerateSdf] Uploading SDF file ${filepath} to Google Drive path ${dest} failed: ${e.message}`, e);
        }
      }
    }
  });
});

router.get('/config/:id/schedule', async (req: express.Request, res: express.Response, next) => {
  let appId = <string>req.params.id;

  try {
    let scheduler = new SchedulerService(req.log);
    let jobName = await scheduler.getJobName(appId);
    let jobInfo = await scheduler.getJob(jobName);
    if (jobInfo === null) {
      jobInfo = { enable: false, schedule: undefined, timeZone: undefined };
    }
    res.send(jobInfo);
  } catch (e) {
    next(e);
  }
});

router.post('/config/:id/schedule/edit', async (req: express.Request, res: express.Response, next) => {
  let appId = <string>req.params.id;
  let jobInfo = <JobInfo>req.body;
  req.log.info(`[WebApi] Updating schedule for configuration ${appId}`);
  try {
    let scheduler = new SchedulerService(req.log);
    // TODO: should we pass a controller's URL (/engine/:id/run)
    await scheduler.updateJob(appId, jobInfo);
    res.send({ status: 'OK' });
  } catch (e) {
    if (!e.logged)
      req.log.error(`[WebApi] Job creation failed: ${e.message}`, e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
  }
});

function initRequestBoundLogger(logger: winston.Logger, appId: string) {
  logger.defaultMeta = Object.assign(logger.defaultMeta || {}, { appId: appId })
}

/**
 * Run exution engine. Basically there're two modes: interactive (isAsync=true) - run manually by user, batch (isAsync=false) - run by Scheduler's job.
 * @param appId application (configuration) id
 * @param isAsync true if executing interactively (from within application), false if executing from a Scheduler's job
 * @param includeDebugLog true to do debug logging
 * @param sendEmail true to send email notifications on finish
 * @param forceUpdate true to do force activation/deactivation of IO/LI even if they are already in a desired state
 * @param dryRun true to do dry run (do not call DV360 API but only pretend)
 * @param req express' request
 * @param res express' response
 */
async function runExecutionEngine(appId: string, isAsync: boolean,
  includeDebugLog: boolean, sendEmail: boolean,
  forceUpdate: boolean, dryRun: boolean,
  req: express.Request, res: express.Response
) {
  const logger = req.log;
  initRequestBoundLogger(logger, appId);
  logger.info(`Starting ExecutionEngine, appId=${appId}, isAsync=${isAsync}, includeDebugLog=${includeDebugLog}, sendEmail=${sendEmail}`, { component: 'WebApi' });
  // load and validate configuration
  let config = await getConfig(logger, appId, res);
  if (!config) return;
  let errors = ConfigValidator.validateRuntimeConfiguration(config);
  if (errors && errors.length) {
    const err = new Error(`[RuleEngineController] There are errors in configuration that prevents from running processing campaigns with it: ` +
      errors.map(e => e.message).join(',\n')
    );
    logger.error(err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: err.message });
    if (!isAsync) {
      trackExecutionStatus(logger, appId, 'error');
    }
    return;
  }

  const opId = uuidv4();
  g_running_ops[opId] = [];
  let traceid: string;
  let loggingDone = false;
  let logOutput: string | null = '';
  // a in-memory transport for winston logger to intercept all log events during execution
  const stream = new Writable({
    write: (chunk: any, encoding: BufferEncoding, next: (error?: Error | null | undefined) => void) => {
      if (!traceid) {
        traceid = chunk[logging_winston.LOGGING_TRACE_KEY];
      }
      // ignoring events from other requests and events from express middleware
      const ignore = traceid !== chunk[logging_winston.LOGGING_TRACE_KEY] ||
        chunk.logName?.endsWith(logging_winston.express.REQUEST_LOG_SUFFIX);
      if (!ignore && (includeDebugLog || chunk.level != 'debug')) {
        const line = chunk.message.toString();
        let op = g_running_ops[opId];
        if (op) {
          op.push(line);
        }
        if (!loggingDone && line !== '__DONE__') {
          logOutput = logOutput + `${chunk.timestamp} ${line}\n`;
        }
        if (line === '__DONE__') {
          loggingDone = true;
        }
      }
      next();
    },
    objectMode: true
  });
  const streamTransport = new winston.transports.Stream({ stream });
  logger.add(streamTransport);

  let controller = new RuleEngineController(
    config,
    logger,
    new RuleEvaluator(),
    new FeedService(logger),
    new DV360Facade(logger, dv_options)
  );

  try {
    let updatedItems: number;
    if (isAsync) {
      // interactive exection (manually from within application)
      let task = controller.run(appId, { forceUpdate, dryRun });
      res.status(StatusCodes.OK).send({ operation: opId });
      updatedItems = await task;
    } else {
      // batch execution from Scheduler
      updatedItems = await controller.run(appId, { forceUpdate, dryRun });
      res.sendStatus(StatusCodes.OK);
      trackExecutionStatus(logger, appId, 'success');
    }
    logger.info(`[RuleEngine] Execution compeleted. Updated items: ${updatedItems}`);

    // NOTE: we can't simply remove streamTransport because
    // winston can do asynchronous logging and not all events where flushed to our transport,
    // So not to loose them we're sending a special event and signal from within the transport
    // (flippping logginDone flag), and only after that remove the transport.
    logger.log('warn', '__DONE__');
    await new Promise((resolve) => {
      function wait() {
        loggingDone ? resolve(true) : setTimeout(wait, 100);
      }
      setImmediate(wait);
    });
    logger.remove(streamTransport);

    if (sendEmail) {
      logger.info('Sending email notification with log');
      notifyOnSuccess(logOutput!, config, logger);
    }
  } catch (e) {
    if (!e.logged)
      logger.error(`[RuleEngine] Execution failed. Error: ${e.message}`, e);
    else
      logger.error(`[RuleEngine] Execution failed.`);

    if (isAsync) {
      // interactive exection (manually from within application)
      // this is a special event for client (anythings starting with 'error:') telling that the op was failed
      logger.error('error:' + e.message);
    } else {
      // batch execution from Scheduler
      trackExecutionStatus(logger, appId, 'error');
    }

    // NOTE: we can't simply remove streamTransport because
    // winston can do asynchronous logging and not all events where flushed to our transport,
    // So not to loose them we're sending a special event and signal from within the transport
    // (flippping logginDone flag), and only after that remove the transport.
    logger.log('warn', '__DONE__');
    await new Promise((resolve) => {
      function wait() {
        loggingDone ? resolve(true) : setTimeout(wait, 100);
      }
      setImmediate(wait);
    });
    logger.remove(streamTransport);

    if (sendEmail) {
      logger.info('Sending email notification with log and error');
      notifyOnError(e, logOutput!, config, logger);
    }

    // NOTE: if isAsync=true then we have sent response already
    if (!isAsync) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message });
    }
  } finally {
    if (!isAsync) {
      // NOTE: for async operation (isAsync=true) operation will be removed in querystatus
      delete g_running_ops[opId];
    }
  }
}

/**
 * Endpoint for automated running engine execution (from Cloud Scheduler)
 */
router.post('/engine/:id/run', async (req: express.Request, res: express.Response, next) => {
  let appId = <string>req.params.id;
  const includeDebugLog = parseBool(req.query.debug);

  await runExecutionEngine(appId, /*isAsync=*/ false, includeDebugLog, /*sendEmail=*/ true,
    /*forceUpdate=*/ false, /*dryRun=*/ false,
    req, res);
});

let g_running_ops: Record<string, string[]> = {};
/**
 * Endpoint for manual starting engine execution from the client w/o streaming,
 * this method starts an operation and return an opid which used later on with querystatus method
 * to query the operation status and get log events.
 */
router.post('/engine/:id/run/legacy/start', async (req: express.Request, res: express.Response, next) => {
  let appId = <string>req.params.id;
  const includeDebugLog = parseBool(req.query.debug);
  const sendEmail = parseBool(req.query.notify);
  const forceUpdate = parseBool(req.query.forceUpdate);
  const dryRun = parseBool(req.query.dryRun);

  await runExecutionEngine(appId, /*isAsync=*/ true, includeDebugLog, sendEmail, forceUpdate, dryRun, req, res);
});

router.get('/engine/:id/run/legacy/querystatus', async (req: express.Request, res: express.Response, next) => {
  const opId = <string>req.query.opid;
  if (!opId) {
    res.status(StatusCodes.BAD_REQUEST).send({ error: 'opid parameter wasn\'t specified' });
    return;
  }
  let log = g_running_ops[opId];
  if (!log) {
    res.status(StatusCodes.OK).send({ events: [], completed: true });
    return;
  }
  let completed = false;
  let result = log.splice(0, log.length);
  for (let i = 0; i < result.length; i++) {
    let line = result[i];
    if (line === '__DONE__') {
      completed = true;
      delete g_running_ops[opId];
      result.splice(i);
      break;
    }
  }
  res.status(StatusCodes.OK).send({ events: result, completed });
});

/**
 * Endpoint for manual running engine execution (from the client) with streaming logs back to client.
 * WARN: streaming isn't supported by Google App Engine, so the endpoint isn't currently used.
 */
router.get('/engine/:id/run/stream', async (req: express.Request, res: express.Response, next) => {
  let started = new Date();
  res.writeHead(200, {
    "X-Accel-Buffering": "no",
    "Content-Type": "text/event-stream",
    "Cache-control": "no-cache"
  });
  let appId = <string>req.params.id;
  const includeDebugLog = parseBool(req.query.debug);
  const logger = req.log;
  initRequestBoundLogger(logger, appId);
  // load and validate configuration
  let config = await getConfig(logger, appId, res);
  if (!config) return;
  let errors = ConfigValidator.validateRuntimeConfiguration(config);
  if (errors && errors.length) {
    next(new Error(`[RuleEngineController] There are errors in configuration that prevents from running processing campaigns with it: ` +
      errors.map(e => e.message).join(',\n'))
    );
    return;
  }

  const stream = new Writable({
    write: (chunk: any, encoding: BufferEncoding, next: (error?: Error | null | undefined) => void) => {
      const line = chunk.message.toString();
      if (includeDebugLog || chunk.level != 'debug') {
        res.write(`data: ${line}\n\n`);
      }
      next();
    },
    objectMode: true
  });
  const streamTransport = new winston.transports.Stream({ stream });
  logger.add(streamTransport);
  if (!IS_GAE) {
    logger.add(
      new winston.transports.File({
        tailable: true,
        filename: path.join(getTempDir(), 'log_run_' + getCurrentDateTimestamp()),
        format: winston.format.printf(
          (info) => `${info.timestamp} ${info.level}: ${info.message}`,
        )
      })
    );
  }

  let controller = new RuleEngineController(
    config, logger,
    new RuleEvaluator(),
    new FeedService(logger),
    new DV360Facade(logger, dv_options)
  );
  try {
    let updatedItems = await controller.run(appId);
    logger.info(`RuleEngine completed. Updated items: ${updatedItems}`);
    logger.remove(streamTransport);
    res.write('data: Done. Elapsed: ' + ((new Date().valueOf() - started.valueOf()) / 1000) + ' sec.\n\n');
    res.end();
  } catch (e) {
    if (!e.logged)
      logger.error(`[WebApi] Execution (${appId}) failed: ${e.message}`, e);
    logger.remove(streamTransport);
    res.write(`data: error:${e.message}\n\n`);
    res.end();
  }
});

/**
 * Return a host name of the current GAE application
 * @returns host name
 */
async function getGAEAppUrl(): Promise<string> {
  let projectId = await getProjectId();
  let gae = (await google.appengine("v1").apps.get({ appsId: `${projectId}` })).data;
  return gae.defaultHostname!;
}

async function notifyOnError(e: Error, log: string, config: Config, logger: Logger) {
  const reciever = config.execution!.notificationEmails;
  if (reciever) {
    let campaignId = config.execution!.campaignId!;
    let advertiserId = config.execution!.advertiserId!;
    try {
      let appurl = await getGAEAppUrl();
      appurl = `https://${appurl}/apps/${config.id}/edit`;
      const text = `Execution for advertiser=${advertiserId} campaign=${campaignId} failed (configuration: ${appurl}): \n${e}\n\nLog:\n${log}`;
      let info = await sendEmail(reciever, 'Triggerator Status: Failure', text);
      logger.debug(`Notification to ${reciever} sent:` + JSON.stringify(info));
    } catch (e) {
      logger.error("[WebApi] An error occured on sending email notification about execution error", e);
    }
  }
}

async function notifyOnSuccess(log: string, config: Config, logger: Logger) {
  const reciever = config.execution!.notificationEmails;
  if (reciever) {
    let campaignId = config.execution!.campaignId!;
    let advertiserId = config.execution!.advertiserId!;
    try {
      let appurl = await getGAEAppUrl();
      appurl = `https://${appurl}/apps/${config.id}/edit`;
      const text = `Execution for advertiser=${advertiserId} campaign=${campaignId} succeeded (configuration: ${appurl})\n\nLog:\n${log}`;
      let info = await sendEmail(reciever, 'Triggerator Status: Success', text);
      logger.debug(`Notification to ${reciever} sent:` + JSON.stringify(info));
    } catch (e) {
      logger.error("[WebApi] An error occured on sending email notification about execution success", e);
    }
  }
}

router.get('/settings', async (req: express.Request, res: express.Response) => {
  let projectId = await getProjectId();
  let mailerInfo = "";
  if (MAILER_CONFIG) {
    mailerInfo = `SMTP: server=${MAILER_CONFIG.host}:${MAILER_CONFIG.port}, from=${MAILER_CONFIG.from}`;
  }
  let settings = {
    "Master Spreadsheet": {
      value: MASTER_SPREADSHEET,
      link: `https://docs.google.com/spreadsheets/d/${MASTER_SPREADSHEET}/edit#gid=0`
    },
    "Service Account": `${projectId}@appspot.gserviceaccount.com`,
    "Is GAE": IS_GAE,
    "GCP Project Id": projectId,
    user: req.user,
    env: {
      // Git commit hash that we put in app.yaml during deployment:
      GIT_COMMIT: process.env.GIT_COMMIT ? {
        value: process.env.GIT_COMMIT,
        link: `https://github.com/google/triggerator/commit/` + process.env.GIT_COMMIT
      } : undefined,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      SECURITTY: process.env.SECURITY,
      EXPECTED_AUDIENCE: process.env.EXPECTED_AUDIENCE,
      LOG_LEVEL: process.env.LOG_LEVEL,
      GAE_APPLICATION: process.env.GAE_APPLICATION,// 	The ID of your App Engine application. This ID is prefixed with 'region code~' such as 'e~' for applications deployed in Europe.
      GAE_DEPLOYMENT_ID: process.env.GAE_DEPLOYMENT_ID,// 	The ID of the current deployment.
      GAE_ENV: process.env.GAE_ENV, // 	The App Engine environment. Set to standard.
      GAE_INSTANCE: process.env.GAE_INSTANCE, // 	The ID of the instance on which your service is currently running.
      GAE_MEMORY_MB: process.env.GAE_MEMORY_MB, // 	The amount of memory available to the application process, in MB.
      GAE_RUNTIME: process.env.GAE_RUNTIME, // 	The runtime specified in your app.yaml file.
      GAE_SERVICE: process.env.GAE_SERVICE, // 	The service name specified in your app.yaml file. If no service name is specified, it is set to default.
      GAE_VERSION: process.env.GAE_VERSION, // 	The current version label of your service.
      NODE_ENV: process.env.NODE_ENV,
    },
    "Mailer config": mailerInfo
  };
  res.send({ settings });
});

router.post('/settings/send-test-email', async (req: express.Request, res: express.Response) => {
  let userEmail = req.user;
  if (IS_GAE && !userEmail) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: "Couldn't detect user" });
    return;
  }
  let emails = <string>req.body.emails;
  let reciever = emails || userEmail;
  if (!reciever) {
    return res.status(StatusCodes.BAD_REQUEST).send({ error: "No emails provided and couldn't detect current user" });
  }
  try {
    const text = `Hi there! This is a test email from Triggerator. Congrats, your mail setup seems to work. See you.`;
    let info = await sendEmail(reciever, 'Triggerator Status: Test', text);
    req.log.debug(`Notification to ${reciever} sent:` + JSON.stringify(info));
    return res.status(StatusCodes.OK).send();
  } catch (e) {
    req.log.error("[WebApi] An error occured on sending email notification about execution success", e);
  }
});

router.post('/settings/reshare', async (req: express.Request, res: express.Response) => {
  let masterSpreadsheetId = MASTER_SPREADSHEET;
  if (!masterSpreadsheetId) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: "Server hasn't been fully configured, master spreadsheet id is missing" });
    return;
  }
  let userEmail = req.user;
  if (!userEmail) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: "Couldn't detect user" });
    return;
  }
  req.log.info(`Resharing all spreadsheets with ${userEmail}`);
  try {
    let tasks = [];
    tasks.push(GoogleDriveFacade.shareFile(MASTER_SPREADSHEET, userEmail));
    let cfgSvc = new ConfigService(req.log);
    let apps: AppList = await cfgSvc.loadApplicationList(masterSpreadsheetId);
    for (const app of apps.configurations) {
      tasks.push(GoogleDriveFacade.shareFile(app.configId, userEmail));
      req.log.debug(`Sharing ${app.configId} doc`);
    }
    req.log.debug(`Waiting all sharing operations to complete`);
    await Promise.all(tasks);
    req.log.info(`Shared ${tasks.length} docs`);
  } catch (e) {
    if (!e.logged)
      req.log.error(`[WebApi] Resharing failed: ${e.message}`, e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message, details: JSON.stringify(e) });
    return;
  }
  res.status(StatusCodes.OK).send({});
});

router.get('/reports/:id/activationtimes', async (req: express.Request, res: express.Response) => {
  let appId = <string>req.params.id;
  const logger = req.log;
  initRequestBoundLogger(logger, appId);
  let reportSvc = new ReportService(logger);
  let fromDate = parseDate(req.query.from);
  let toDate = parseDate(req.query.to);

  if (!toDate) {
    toDate = new Date();
  }
  if (!fromDate) {
    throw new Error("[ReportService] Required argument 'from' is missing");
  }
  if (req.query.from && !_.isDate(fromDate)) {
    throw new Error("[ReportService] Invalid date value for 'from' argument: " + req.query.from);
  }
  if (req.query.to && !_.isDate(toDate)) {
    throw new Error("[ReportService] Invalid date value for 'to' argument: " + req.query.to);
  }
  const format = req.query.format;
  const excludeEmpty = parseBool(req.query.excludeEmpty);
  const ownerUser = parseString(req.query.ownerUser);
  const destination_folder = parseString(req.query.destination_folder);

  logger.info(`[WebApi] Generating a report ActivationTimeSummary for period ${fromDate.toISOString()}-${toDate.toISOString()}, format=${format}, excludeEmpty=${excludeEmpty}, ownerUser=${ownerUser}, destination_folder=${destination_folder}`);
  let csvText: string;
  // #1 generate CSV data
  try {
    csvText = await reportSvc.buildLineItemActiveTimeSummaryReport(appId, fromDate, toDate, excludeEmpty);
  } catch (e) {
    if (!e.logged)
      logger.error(`[WebApi] Report generation failed: ${e.message}`, e);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: e.message, details: JSON.stringify(e) });
    return;
  }
  logger.debug(`[WebApi] Report is generated:\n` + csvText);

  // #2 write CSV into a file
  let outputFile = path.join(path.resolve(getTempDir()), `report-activations-${fromDate.toISOString()}-${toDate.toISOString()}.csv`);
  fs.writeFileSync(outputFile, csvText);

  if (format === 'csv') {
    // #3.1 return file as a download
    logger.debug(`Sending a generated CSV file ${outputFile}`);
    res.download(outputFile, async (err) => {
      if (err) {
        logger.error(`[WebApi][Report] Sending CSV ${outputFile} failed: ${err.message}`, err);
        return;
      }
    });
  } else if (format === 'spreadsheet') {
    // #3.2 import file into gDrive as gSpreadsheet and transfer ownership to the specified (or current user)
    const title = `Activation times between ${fromDate.toLocaleString()} and ${toDate.toLocaleString()}`;
    try {
      let fileId = await GoogleDriveFacade.importCsvAsSpreadsheet(outputFile, title, ownerUser || req.user);
      res.status(StatusCodes.OK).send({fileId});
    } catch (e) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({ error: 'Import CSV into Google Spreadsheet failed:' + e.message, details: JSON.stringify(e) });
    }
  }

  // #4 optionally save file to gDrive or GCS if the user asked for it
  if (destination_folder) {
    if (destination_folder.startsWith('gs://')) {
      uploadFileToGCS(outputFile, destination_folder).catch(e => {
        req.log.error(`[WebApi] Uploading report file ${outputFile} to GCS path ${destination_folder} failed: ${e.message}`, e);
      }).then(() => {
        req.log.info(`[WebApi] Generated report file ${outputFile} successfully uploaded to GCS '${destination_folder}'`);
      });
    } else if (destination_folder.startsWith('drive://')) {
      try {
        await GoogleDriveFacade.uploadFile(outputFile, destination_folder);
        req.log.info(`[WebApi] Generated report file ${outputFile} successfully uploaded to Google Drive folder '${destination_folder}'`)
      } catch (e) {
        req.log.error(`[WebApi] Uploading report file ${outputFile} to Google Drive path ${destination_folder} failed: ${e.message}`, e);
      }
    }
  }

});

export = router;