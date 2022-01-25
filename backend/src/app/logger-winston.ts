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
import argv from './../argv';
import winston from 'winston';
import {LoggingWinston} from '@google-cloud/logging-winston';
import { CLOUD_LOGGING, IS_GAE, LOG_LEVEL } from './../env';

const {format} = winston;

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
}

winston.addColors(colors)

export const CLOUD_LOG_NAME = 'Triggerator';

const transports: winston.transport[] = []
if ((IS_GAE || CLOUD_LOGGING) && CLOUD_LOGGING !== false) {
  // we're in GAE, or Cloud Logging excplicitly enabled and it wasn't disabled
  transports.push(new LoggingWinston({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
    keyFilename: argv.keyFile,
    logName: CLOUD_LOG_NAME,
    labels: {
      name: 'Triggerator'
    },
  })
  );
}
if (!IS_GAE || transports.length === 0) {
  // we're not in GAE (running locally) or need a default transport
  transports.push(new winston.transports.Console({
    format: format.combine(
      format.colorize({ all: true }),
      format.printf(
        (info) => `${info.timestamp} ${info.level}: ${info.message}`,
      ),
    )
  }));
}

const logger = winston.createLogger({
  level: LOG_LEVEL, // NOTE: we use same log level for all transports
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
    // format to add 'component' meta value into log message (prepending '[$component] ')
    winston.format((info: winston.Logform.TransformableInfo, opts?: any) => {
      if (info.component && info.message && !info.message.startsWith(`[${info.component}]`)) {
        info.message = `[${info.component}] ${info.message}`;
      }
      return info;
    })()
  ),
  transports
});
export default logger;

// Logger adapter for morgan (logging Express middleware)
// We used to use morgan for logging http requests (api calls) before,
// but with cloud-logging it seems excessive.
// before enabling morgan should be installed: `npm i morgan`
// const myStream = {
//   write: (text: string) => {
//     // NOTE: there was an idea to use a special level here (e.g. 'http') but it doesn't work (Winston crashed with "Unknown log level http")
//     logger.log('info', text.replace(/\n$/, ''));
//   }
// }
// export var expressLoggingMiddleware = morgan('combined', { stream: myStream });
