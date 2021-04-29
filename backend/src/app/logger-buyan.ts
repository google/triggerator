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
import argv from './../argv';
import bunyan, { LogLevel } from 'bunyan';
//import morgan from 'morgan';
 // Imports the Google Cloud client library for Bunyan
import {LoggingBunyan} from '@google-cloud/logging-bunyan';
import {LOG_LEVEL} from '../env'
// Creates a Bunyan Cloud Logging client
const cloudLogger = new LoggingBunyan({projectId: 'triggerator-sd', keyFilename: argv.keyFile});

// Create a Bunyan logger that streams to Cloud Logging
// Logs will be written to: "projects/YOUR_PROJECT_ID/logs/bunyan_log"
const logger = bunyan.createLogger({
  name: 'Triggerator',
  src: (process.env.NODE_ENV === "production") ? false : true,
  level: 'debug',
  streams: [
    // Log to the console at 'info' and above
    {stream: process.stdout},
    // And log to Cloud Logging, logging at 'info' and above
    cloudLogger.stream(LOG_LEVEL as LogLevel),
  ],
});
logger.debug({component: 'system'}, `Logger initialized. LOG_LEVEL=${LOG_LEVEL}`);
export default logger;