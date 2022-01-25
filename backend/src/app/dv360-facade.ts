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
import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import { google, displayvideo_v1 as dv360, displayvideo_v1 } from 'googleapis';
import yauzl from 'yauzl';
import csv_parse from 'csv-parse/lib/sync';
import _ from 'lodash';
import { RecordSet, SdfFull } from '../types/types';
import { getTempDir } from '../env';
import { Logger } from '../types/logger';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface SdfDownloadOptions {
  max_wait?: number,
  polling_interval?: number
}
export interface DV360FacadeOptions {
  apiOptions?: dv360.Options;
  keepDownloadedFiles?: boolean;
  useLocalCache?: boolean
}
type DownloadOptionsRuntime = { max_wait: number, polling_interval: number };
const TEMP_DIR = getTempDir();

export default class DV360Facade {
  private dv_api: displayvideo_v1.Displayvideo;
  private options: DV360FacadeOptions;

  constructor(public logger: Logger, options?: DV360FacadeOptions) {
    if (!logger) throw new Error('[DV360Facade] Required argument logger is missing');
    options = options || {};
    options.apiOptions = options.apiOptions || { version: "v1" };
    if (!options.apiOptions.version)
      options.apiOptions.version = "v1";
    this.options = options;
    this.dv_api = google.displayvideo(options.apiOptions);
  }

  async updateInsertionOrderStatus(advertiserId: string, ioId: string, status: 'active' | 'paused') {
    let io = (await this.dv_api.advertisers.insertionOrders.patch({
      advertiserId: advertiserId,
      insertionOrderId: ioId,
      updateMask: 'entityStatus',
      requestBody: {
        entityStatus: status === 'active' ? 'ENTITY_STATUS_ACTIVE' : 'ENTITY_STATUS_PAUSED'
      }
    })).data;
    // NOTE: the format of log message is important, it's used in reporting (search before changing)
    this.logger.info(`[DV360Facade] InsertionOrder ${io.name}(${ioId}) now has entity status ${io.entityStatus}.`);
  }

  async updateLineItemStatus(advertiserId: string, liId: string, status: 'active' | 'paused') {
    let li = (await this.dv_api.advertisers.lineItems.patch({
      advertiserId: advertiserId,
      lineItemId: liId,
      updateMask: 'entityStatus',
      requestBody: {
        entityStatus: status === 'active' ? 'ENTITY_STATUS_ACTIVE' : 'ENTITY_STATUS_PAUSED'
      }
    })).data;
    // NOTE: the format of log message is important, it's used in reporting (search before changing)
    this.logger.info(`[DV360Facade] LineItem ${li.name}(${liId}) now has entity status ${li.entityStatus}.`);

    /*
        // request body parameters:
        //   "advertiserId": "my_advertiserId",
        //   "bidStrategy": {},
        //   "budget": {},
        //   "campaignId": "my_campaignId",
        //   "conversionCounting": {},
        //   "creativeIds": [],
        //   "displayName": "my_displayName",
        //   "entityStatus": "my_entityStatus",
        //   "flight": {},
        //   "frequencyCap": {},
        //   "insertionOrderId": "my_insertionOrderId",
        //   "integrationDetails": {},
        //   "inventorySourceIds": [],
        //   "lineItemId": "my_lineItemId",
        //   "lineItemType": "my_lineItemType",
        //   "name": "my_name",
        //   "pacing": {},
        //   "partnerCosts": [],
        //   "partnerRevenueModel": {},
        //   "targetingExpansion": {},
        //   "updateTime": "my_updateTime",
        //   "warningMessages": []
     */

  }

  static readonly DEFAULT_MAX_WAIT = 600_000;
  static readonly DEFAULT_POLLING_INTERVAL = 1_000;

  private getDownloadOptions(options?: SdfDownloadOptions | null): DownloadOptionsRuntime {
    if (!options)
      options = {};
    return {
      max_wait: options.max_wait || DV360Facade.DEFAULT_MAX_WAIT,
      polling_interval: options.polling_interval || DV360Facade.DEFAULT_POLLING_INTERVAL
    };
  }

  private _lookupInLocalCache(advertiserId: string, campaignId: string): string | null {
    if (!fs.existsSync(TEMP_DIR))
      return null;

    // inside the temp folder there could be a bunch of files like sdf-506732-3242703-1613696116620.zip,
    // where sdf-{advertiser_id}-{campaing_id}-{unix_timestamp}.zip (see generateTempFilename),
    // just take the latest one
    let files = fs.readdirSync(TEMP_DIR)
      .filter(fn => fn.endsWith('.zip') && fn.startsWith(`sdf-${advertiserId}-${campaignId}`))
      .sort();
    if (!files || files.length === 0)
      return null;
    let fileName = files[files.length - 1];
    fileName = path.join(path.resolve(TEMP_DIR), fileName);
    return fileName;
  }

  async downloadSdf(advertiserId: string, campaignId: string, options?: SdfDownloadOptions | null): Promise<SdfFull> {
    if (!campaignId)
      throw new Error(`[DV360Facade] DV360 campaign id is missing`);
    if (!advertiserId)
      throw new Error(`[DV360Facade] Advertiser id is missing`);

    let opt = this.getDownloadOptions(options);
    let resourceName: string;
    let fileName;
    if (this.options.useLocalCache) {
      this.options.keepDownloadedFiles = true;
      // for debugging purpose search for a downloaded file locally instead of fetching from DV360 (it takes >30 seconds!)
      fileName = this._lookupInLocalCache(advertiserId, campaignId);
      if (fileName) resourceName = "<local cache>";
    }
    if (!fileName) {
      ({ fileName, resourceName } = await this._downloadSdf(advertiserId, campaignId, opt));
    }
    this.logger.debug(`[DV360Facade] SDF was downloaded into a zip archive ${fileName}`);

    let files = await this.unzipAndReadSdf(fileName, resourceName!);

    // remove downloaded archive
    if (!this.options.keepDownloadedFiles) {
      try {
        fs.unlinkSync(fileName);
        // Note rmSync added only in NodeJS 14.14
        // fs.rmSync(filename);
      } catch (e) {
        this.logger.warn(`[DV360Facade] Failed to delete a downloaded file ${fileName}: ${e}`);
      }
    }

    // Convert files' string content to structured SDF
    let sdf: Record<string, RecordSet> = {};
    Object.keys(files).forEach(entity => {
      // Campaigns, InsertionOrders, LineItems, AdGroups, AdGroupAds
      const csv = csv_parse(files[entity], {
        columns: true,
        skip_empty_lines: true
      });
      if (!csv.length) return;
      let rs = RecordSet.fromValues(csv);
      switch (entity) {
        case 'Campaigns':
          sdf['campaigns'] = rs;
          break;
        case 'InsertionOrders':
          sdf['insertionOrders'] = rs;
          break;
        case 'LineItems':
          sdf['lineItems'] = rs;
          break;
        case 'AdGroups':
          sdf['adGroups'] = rs;
          break;
        case 'AdGroupAds':
          sdf['ads'] = rs;
          break;
      }
    });
    let sdf2 = Object.assign(
      { advertiserId: advertiserId },
      _.pick(sdf, 'campaigns', 'insertionOrders', 'lineItems', 'adGroups', 'ads')
    );
    this.logger.info(`[DV360Facade] SDF structure successfully read from zip archive. IO count: ${sdf2.insertionOrders?.rowCount}, LI count: ${sdf2.lineItems?.rowCount}`);
    return sdf2;
  }

  private async _downloadSdf(advertiserId: string, campaignId: string, opt: DownloadOptionsRuntime): Promise<{ fileName: string, resourceName: string }> {
    this.logger.info(`[DV360Facade] Starting downloading SDF for advertiser/campaign ${advertiserId}/${campaignId}`);
    let op:dv360.Schema$Operation;
    try {
      op = (await this.dv_api.sdfdownloadtasks.create({
        requestBody: {
          "advertiserId": advertiserId,
          "parentEntityFilter": {
            "fileType": [
              "FILE_TYPE_CAMPAIGN",
              "FILE_TYPE_INSERTION_ORDER",
              "FILE_TYPE_LINE_ITEM",
              "FILE_TYPE_AD_GROUP",
              "FILE_TYPE_AD"
            ],
            "filterType": "FILTER_TYPE_CAMPAIGN_ID",
            "filterIds": [campaignId]
          },
          //version: "SDF_VERSION_5_3" //SDF_VERSION_UNSPECIFIED
        },
      })).data;
    } catch(e) {
      if (e.error) {
        throw new Error(`[DV360Facade] sdfdownloadtasks.create for campaign ${campaignId} failed: code=${e.error.code}, message=${e.error.message}`);
      } else {
        throw e;
      }
    }
    if (op.error) {
      // TODO: should we log error.details as well?
      throw new Error(`[DV360Facade] sdfdownloadtasks.create for campaign ${campaignId} failed: code=${op.error.code}, message=${op.error.message}`);
    }
    const op_name = op.name!;

    // #2 wait for the task to complete, polling for operation status
    this.logger.info(`[DV360Facade] Waiting for the SDF to be exported by DV360 and ready to download (please expect >30 sec to wait)`);
    let started = Date.now();
    while (true) {
      op = (await this.dv_api.sdfdownloadtasks.operations.get({ name: op_name })).data;
      if (op.error) {
        throw new Error(op.error!.message || op.error!.code?.toFixed() || op.error.details!.join().toString());
      }
      if (op.done) break;
      sleep(opt.polling_interval);
      if (Date.now() - started > opt.max_wait)
        throw new Error(`Operation ${op_name} timed out (timeout=${opt.max_wait / 1000}s)`);
    }
    let resourceName = op.response!.resourceName;
    this.logger.info(`[DV360Facade] SdfDownload ${op_name} completed, created resource ${resourceName}, elapsed: ${(Date.now() - started) / 1000} sec`);

    // #3 downlaod a zip file with CSVs
    let res = (await this.dv_api.media.download({ resourceName: resourceName, alt: 'media' }, { responseType: 'stream' }));
    let stream = res.data;
    if (!fs.existsSync(TEMP_DIR))
      fs.mkdirSync(TEMP_DIR);
    let fileName = path.join(path.resolve(TEMP_DIR), this.generateTempFilename(advertiserId, campaignId))
    let writeStream = stream.pipe(fs.createWriteStream(fileName));
    let end = new Promise<{ fileName: string, resourceName: string }>(function (resolve, reject) {
      writeStream.on('close', () => resolve({ fileName, resourceName }));
      stream.on('error', reject); // or something like that. might need to close `hash`
    });
    return end;
  }

  private generateTempFilename(advertiserId: string, campaignId: string) {
    //let rnd = random(10000,false).toLocaleString('en-US', {minimumIntegerDigits: 5, useGrouping:false});
    return `sdf-${advertiserId}-${campaignId}-${Date.now()}.zip`;
  }

  private unzipAndReadSdf(filename: string, resourceName: string): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      yauzl.open(filename, { lazyEntries: true }, (err: Error | undefined, zipfile: yauzl.ZipFile | undefined) => {
        if (err || !zipfile) {
          throw new Error(`[DV360Facade] A file returned by DV360 API (${resourceName}) cannot be parsed as zip: ${err}`);
        }
        const fileCount = zipfile.entryCount || 0;
        if (fileCount === 0) {
          throw new Error(`[DV360Facade] An archive returned by DV360 API (${resourceName}) is empty`);
        }
        zipfile.readEntry();
        let sdf: Record<string, string> = {};
        zipfile.on('entry', (entry: yauzl.Entry) => {
          if (/\/$/.test(entry.fileName)) {
            // directory entry (Directory file names end with '/')
            zipfile.readEntry();
          } else {
            // file entry
            let fileContent = '';
            const outStream = new Writable({
              write(chunk, encoding, callback) {
                fileContent += chunk.toString();
                callback();
              }
              // final(callback) {
              //   resolve(strData);
              // }
            });
            // All files in archive are expeteced to have names like SDF-XXX.csv,
            // where XXX either: Campaigns, InsertionOrders, LineItems, AdGroupAds, AdGroupAds
            let match = /SDF\-([^.]+)/.exec(entry.fileName);
            if (!match || !match.length) {
              throw new Error(`[DV360Facade] Unexpected file found in SDF archive '${entry.fileName}' returned by DV360 API (${resourceName})`);
            }
            let entityType = match[1];
            zipfile.openReadStream(entry, (err, stream) => {
              if (err) throw err;
              stream!.on("end", function () {
                sdf[entityType] = fileContent;
                zipfile.readEntry();
              });
              stream!.pipe(outStream);
            });
          }
        });
        zipfile.on('end', () => {
          resolve(sdf);
        });
      });
    });
  }
}