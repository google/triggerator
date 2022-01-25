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
import { Log, Logging } from '@google-cloud/logging';
import { Entry, LogEntry } from '@google-cloud/logging/build/src/entry';
import { GoogleAuth } from 'google-auth-library';
import { sheets_v4, google } from 'googleapis';
import { Logger } from '../types/logger';
import { getProjectId } from './cloud-utils';
import { CLOUD_LOG_NAME } from './logger-winston';

enum EntityStatus {
  Active = 'Active',
  Paused = 'Paused'
}
interface LineItemDesc {
  duration: number;
  activateStart?: Date | null;
  activationCount: number;
  startStatus: EntityStatus;
  lastStatus?: EntityStatus;
}
type Report = Record<string, LineItemDesc>;

export default class ReportService {
  //sheetsAPI: sheets_v4.Sheets;

  constructor(public logger: Logger) {
    if (!logger) throw new Error('[ReportService] Required argument logger is missing');
    //this.sheetsAPI = google.sheets({ version: "v4" });
  }

  async buildLineItemActiveTimeSummaryReport(appId: string, fromDate: Date, toDate: Date, excludeEmpty: boolean = false): Promise<string> {
    const projectId = await getProjectId();
    //let keyFile = argv.keyFile;
    // const auth = new google.auth.GoogleAuth({
    //   keyFile: argv.keyFile,
    // });
    let auth = google._options.auth;
    const logging = new Logging({ projectId, auth: <GoogleAuth>auth });
    const log = logging.log(CLOUD_LOG_NAME);

    if (!fromDate) {
      throw new Error("[ReportService] Required argument 'from' is missing");
    }
    this.logger.info(`[ReportService] Fetching log for ${appId} configuration from ${fromDate} till ${toDate}`);

    let report = await this._calc_LineItemActiveTimeSummary(appId, log, fromDate, toDate);
    let csv = this._generateCSV_LineItemActiveTimeSummary(report, excludeEmpty);
    return csv;
  }

  private handleFirstSwitch(ts: Date, fromDate: Date, status: EntityStatus): LineItemDesc {
    if (status === EntityStatus.Paused) {
      let duration = ts.valueOf() - fromDate.valueOf();
      return {
        duration,
        activationCount: 1,
        startStatus: status
      };
    }
    else {
      return {
        activateStart: ts,
        duration: 0,
        activationCount: 1,
        startStatus: status
      };
    }
  }
  private handleSwitch(li: LineItemDesc, ts: Date, status: EntityStatus) {
    if (status === EntityStatus.Paused) {
      // we expect that previously it was activate, so there's activateStart
      if (li.activateStart) {
        let duration = ts.valueOf() - li.activateStart.valueOf();
        li.duration += duration;
        li.activateStart = null;
        li.lastStatus = EntityStatus.Paused;
      }
    }
    else {
      // li activated
      if (!li.activateStart) {
        // it can be activated several times in a row, we only need the first one
        li.activateStart = ts;
        li.activationCount += 1;
        li.lastStatus = EntityStatus.Active;
      }
    }
  }
  private handleFirstSkippedSwitch(ts: Date, fromDate: Date, status: EntityStatus): LineItemDesc {
    if (status === EntityStatus.Active) {
      // [RuleEngine] activating LI 51874283 skipped because it's already active and forceUpdate=false
      return {
        activateStart: fromDate,
        duration: 0,
        activationCount: 0,
        startStatus: EntityStatus.Active
      };
    }
    else {
      // [RuleEngine] deactivation LI XXX skipped because it's already non-active
      return {
        duration: 0,
        activationCount: 0,
        startStatus: EntityStatus.Paused
      };
    }
  }
  private async _calc_LineItemActiveTimeSummary(appId: string, log: Log, fromDate: Date, toDate: Date): Promise<Report> {
    // See https://googleapis.dev/nodejs/logging/latest/Logging.html#getEntries
    // NOTE: paging is handled automaticaly (autoPaginate=true by default)
    const [entries, nextPageToken] = await log.getEntries({
      filter: `timestamp >= "${fromDate.toISOString()}" AND timestamp <= "${toDate.toISOString()}"`,
      orderBy: 'timestamp asc',
    });

    let result: Report = {};
    entries.forEach((entry: Entry) => {
      const metadata: LogEntry = entry.metadata;
      if (!metadata.jsonPayload?.fields?.message) return;
      const ts = <Date>metadata.timestamp;
      let text = metadata.jsonPayload.fields!.message.stringValue;
      if (!text) return;
      // filter entry by appid (it's a custom metadata that we write in request-bound child loggers)
      if (metadata.jsonPayload.fields!.metadata?.structValue?.fields) {
        let logAppId = metadata.jsonPayload.fields.metadata.structValue.fields.appId?.stringValue;
        if (logAppId && logAppId != appId) return;
      }
      // NOTE: we'll test for several use-cases:
      // 1. explicit activation/deactivation of LI
      // 2. skipped activation/deactivation (because desired state is already met)
      // 3. implicit activation/deactivation of LI due to IO activation/deactivation

      // test for "[DV360Facade] LineItem ${li.name}(${liId}) now has entity status ${li.entityStatus}"
      let reChanged = /LineItem advertisers\/\d+\/lineItems\/\d+\((?<liid>\d+)\) now has entity status (?<status>ENTITY_STATUS_ACTIVE|ENTITY_STATUS_PAUSED)/;
      let groups = reChanged.exec(text)?.groups;
      if (groups) {
        let liid = groups['liid'];
        let status = groups['status'] === 'ENTITY_STATUS_PAUSED' ? EntityStatus.Paused : EntityStatus.Active;
        if (!result[liid]) {
          result[liid] = this.handleFirstSwitch(ts, fromDate, status);
        }
        else {
          this.handleSwitch(result[liid], ts, status);
        }
      }
      else {
        // [RuleEngine] activating LI 51874283 skipped because it's already active and forceUpdate=false
        let reSkipped = /(?<action>activating|activation|deactivating|deactivation) LI (?<liid>\d+) skipped because it's already/;
        let match = reSkipped.exec(text);
        if (match && match.groups) {
          let liid = match.groups['liid'];
          //console.debug(`${ts.toISOString()} : ${text}`);
          if (!result[liid]) {
            // we met the LI for the first time,
            // but it's not being activated/deactivated, it's skipped because desired status already same
            // activating|activation|deactivating|deactivation
            let action = match.groups['action'];
            let status = action === 'activating' || action === 'activation' ? EntityStatus.Active : EntityStatus.Paused;
            result[liid] = this.handleFirstSkippedSwitch(ts, fromDate, status);
          }
        }
        else {
          // handling activation/deactivation of IOs
          // test for "[RuleEngine] activated IO $ioId has active LI $liId"
          // test for "[RuleEngine] deactivated IO $ioId has active LI $liId"
          // test for "[RuleEngine] skipped activated IO $ioId has active LI $liId"
          // test for "[RuleEngine] skipped deactivated IO $ioId has active LI $liId"
          let reNested = /(?<skip>skipped )?(?<status>activated|deactivated) IO \d+ has active LI (?<liid>\d+)/;
          let match = reNested.exec(text);
          if (match && match.groups) {
            let liid = match.groups['liid'];
            let status = (match.groups['status'] === 'activated') ? EntityStatus.Active : EntityStatus.Paused;
            if (!match.groups['skip']) {
              if (!result[liid]) {
                result[liid] = this.handleFirstSwitch(ts, fromDate, status);
              }
              else {
                this.handleSwitch(result[liid], ts, status);
              }
            }
            else {
              // handle skipped (de)activation
              result[liid] = this.handleFirstSkippedSwitch(ts, fromDate, status);
            }
          }
        }
      }
    });
    // for all LIs, those that were activated terminate pending periods of active state at toDate
    for (const liid of Object.keys(result)) {
      let li = result[liid];
      if (li.activateStart) {
        let duration = toDate.valueOf() - li.activateStart.valueOf();
        li.duration += duration;
        li.activateStart = null;
      }
      if (!li.lastStatus) {
        li.lastStatus = li.startStatus;
      }
    }
    return result;
  }

  private _generateCSV_LineItemActiveTimeSummary(result: Report, excludeEmpty: boolean): string {
    let csv = 'Line Item Id,Duration (mins),Duration (hours),Start Status,End Status,Activations\n';
    for (const liid of Object.keys(result)) {
      let li = result[liid];
      if (!excludeEmpty || li.duration > 0) {
        let duration = li.duration / 1000 / 60;
        csv += `${liid},${duration.toFixed(2)},${(duration / 60).toFixed(2)},${li.startStatus},${li.lastStatus},${li.activationCount}\n`;
      }
    }
    return csv;
  }
}