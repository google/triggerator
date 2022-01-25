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
import { URL } from 'url';
import { Writable } from 'stream';
import _ from 'lodash';
import { GaxiosError, GaxiosOptions, GaxiosResponse, request } from 'gaxios';
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { Storage } from '@google-cloud/storage';
import { BigQuery } from '@google-cloud/bigquery';
import zlib from 'zlib';
import yauzl from 'yauzl';
import csv_parse from 'csv-parse/lib/sync';
import { decode } from 'iconv-lite';
import argv from './../argv';
import { FeedConfig, FeedInfo, FeedType, Feed_BigQuery_Url_RegExp } from '../types/config';
import { FeedData } from '../types/types';
import { tryParseNumber } from './utils';
import GoogleDriveFacade from './google-drive-facade';
import { Logger } from '../types/logger';
import { getProjectId } from './cloud-utils';
import { OAUTH_SCOPES } from '../consts';


type FeedInfoData = { feed: FeedData, info: FeedInfo };
type FeedJoinData = { feed: FeedData, name: string, key: string, ext_key?: string };

export default class FeedService {
  constructor(public logger: Logger) {
    if (!logger) throw new Error('[FeedService] Required argument logger is missing');
  }

  async loadSpreadsheet(feedInfo: FeedInfo): Promise<FeedData> {
    const sheetsAPI = google.sheets({ version: "v4" });

    // NOTE: for gSheets url can be either a full url or just an spreadsheet id:
    //  full url: https://docs.google.com/spreadsheets/d/1Zf5MpraZTY8kWPm8is6tAAcywsIc3P-X_acwIwXRAhs/edit
    //  optionally urls can contain a hash with sheet id, e.g.: #gid=343890871
    //  spreadsheet id:  1Zf5MpraZTY8kWPm8is6tAAcywsIc3P-X_acwIwXRAhs
    const url = feedInfo.url;
    let spreadsheetId = url;
    let sheetId: number = -1;
    let rangeName: string = '';
    if (url.startsWith('http')) {
      // extract docid from url like: /spreadsheets/d/1Zf5MpraZTY8kWPm8is6tAAcywsIc3P-X_acwIwXRAhs/edit
      let match = /spreadsheets\/d\/([^\/]+)/.exec(url);
      if (!match) {
        throw new Error(`[FeedService] Couldn't extract a spreadsheet id from the url: ${url}`);
      }
      spreadsheetId = match[1];
      // extract sheetId from hash
      match = /#gid=(\d+)/.exec(url);
      if (match) {
        sheetId = parseInt(match[1]);
      }
    } else if (url.indexOf(",") > 0) {
      // url contains a range, e.g.:
      //  1Zf5MpraZTY8kWPm8is6tAAcywsIc3P-X_acwIwXRAhs,Data!B2:Z
      const pair = url.split(',');
      spreadsheetId = pair[0];
      rangeName = pair[1];
    } // otherwise url is just a spredasheet id
    // load a list of sheets
    if (!rangeName) {
      let spreadsheet: sheets_v4.Schema$Spreadsheet;
      try {
        spreadsheet = (await sheetsAPI.spreadsheets.get({
          spreadsheetId: spreadsheetId,
          includeGridData: false
        })).data;
      } catch (e) {
        this.logger.error(`[FeedService] Fetching Spreadsheet ${spreadsheetId} failed: ${e.message}`, e);
        e.logged = true;
        throw e;
      }
      let sheets = spreadsheet.sheets;
      if (!sheets) {
        throw new Error(`[FeedService] Couldn't load a list of sheets for spreadsheet ${spreadsheetId}`);
      }
      let sheetName: string = '';
      if (sheetId > 0) {
        for (const sheet of sheets) {
          if (sheet.properties && sheet.properties && sheet.properties.sheetId === sheetId) {
            sheetName = sheet.properties.title || '';
            break;
          }
        }
      } else {
        sheetName = (sheets[0].properties ? sheets[0].properties.title : '') || '';
      }
      // now construct a range

      if (sheetName)
        rangeName = sheetName + "!A1:Z";
      else
        rangeName = "A1:Z";
    }

    // now load sheet data
    this.logger.log('info', `Loading values from spreadsheet '${spreadsheetId}' in range '${rangeName}'`, {component: 'FeedService'});
    const request = {
      spreadsheetId: spreadsheetId,
      range: rangeName,
      majorDimension: 'ROWS'
    };
    let values = (await sheetsAPI.spreadsheets.values.get(request)).data.values;
    if (!values) {
      throw new Error(`[FeedService] Spreadsheet ${spreadsheetId} contains no data in range ${rangeName}`);
    }

    // skip empty rows and find first non-empty rows, it'll be headers
    let columns: string[] | undefined;
    for (let i = 0; i < values.length; i++) {
      if (!values[i] || values[i].length === 0) continue;
      columns = values[i];
      values = values.slice(i + 1);
      break;
    }
    if (!columns) {
      // we didn't find a non-empty row, it's very weird and should NOT happen
      throw new Error(`[FeedService] Couldn't find a row with column headers`);
    }
    if (values.length === 0) {
      throw new Error(`[FeedService] Returned data is empty`);
    }
    // Old solution for array-based FeedData:
    // for (let i = 0; i < values.length; i++) {
    //   let row = values[i];
    //   for (let j = 0; j < row.length; j++) {
    //     let val = row[j];
    //     let parsed = tryParseNumber(val);
    //     if (parsed !== undefined)
    //       row[j] = parsed;
    //   }
    // }
    //return new FeedData(feedInfo, columns, values);

    // construct array of objects from matrix
    let objects: Record<string, any>[] = this.createObjectsFromRows(values, columns);
    this.logger.debug(`[FeedService] Loaded ${values.length} rows, columns: ${JSON.stringify(columns)}`);
    return new FeedData(objects);
  }

  private createObjectsFromRows(values: any[][], columns: string[]) {
    let objects: Record<string, any>[] = [];
    for (let i = 0; i < values.length; i++) {
      let row = values[i];
      let obj: Record<string, any> = {};
      for (let j = 0; j < row.length; j++) {
        let val = row[j];
        let parsed = tryParseNumber(val);
        if (parsed !== undefined)
          val = parsed;
        obj[columns[j]] = val;
      }
      objects.push(obj);
    }
    return objects;
  }

  async loadBigQuery(feedInfo: FeedInfo): Promise<FeedData> {
    // supported syntax for url:
    //  - projects/project_id/datasets/dataset_id/tables/table_id
    //  - datasets/dataset_id/tables/table_id (project_id will be used from current auth)
    //  - datasets/dataset_id/views/view_id
    //let rePath = /(projects\/(?<project>[^\/]+)\/)?datasets\/(?<dataset>[^\/]+)\/(tables\/(?<table>.+)|views\/(?<view>.+)|procedures\/(?<proc>.+))/;
    let rePath = new RegExp(Feed_BigQuery_Url_RegExp);
    let match = rePath.exec(feedInfo.url);
    if (!match || !match.groups) {
      throw new Error(`Unsupported BigQuery url (${feedInfo.url}), expected projects/project_id/datasets/dataset_id/[tables/table_id|views/view_id|procedures/proc_id]`);
    }

    let projectId = match.groups['project'];
    if (!projectId) {
      projectId = await getProjectId();
    }
    let datasetId = match.groups['dataset'];
    let tableId = match.groups['table'];
    let viewId = match.groups['view'];
    let procedure = match.groups['proc']

    // Using old api client (supports global auth via google.auth)
    // const bigquery = google.bigquery('v2');
    // const res = (await bigquery.tabledata.list({
    //   projectId: projectId,
    //   datasetId: datasetId,
    //   tableId: tableId,
    //   maxResults: 1000,
    // })).data;
    // let values = res.rows!;
    //return new FeedData(values);

    //let auth = google._options.auth;
    // NOTE: we have to pass oauth scope explicitly as BigQuery doesn't support auth object from google-auth-library
    // and for accessing external tables (even through a view) additional scope (drive) is required
    const bigquery = new BigQuery({
      projectId: projectId,
      //credentials: await (<GoogleAuth>auth).getCredentials(),
      scopes: OAUTH_SCOPES,
      keyFilename: argv.keyFile,
    });
    if (tableId) {
      const dataset = bigquery.dataset(datasetId);
      const table = await dataset.table(tableId);
      let [metadata] = await table.getMetadata();
      let columns = metadata.schema.fields.map((field:any) => field.name);
      let [values] = <any[][]>await table.getRows();
      return new FeedData(values);
    }
    if (viewId) {
      let [values] = (await bigquery.query(`select * from \`${projectId}.${datasetId}.${viewId}\``));
      this.logger.debug(`[FeedService] Loaded ${values.length} rows from BigQuery view ${projectId}.${datasetId}.${viewId}`);
      return new FeedData(values);
    }
    else if (procedure) {
      let [values] = (await bigquery.query(`call \`${projectId}.${datasetId}.${procedure}\`()`));
      this.logger.debug(`[FeedService] Loaded ${values.length} rows from BigQuery stored procedure ${projectId}.${datasetId}.${procedure}`);
      return new FeedData(values);
    }
    throw new Error(`Unsupported BigQuery url (${feedInfo.url})`);
  }

  unzip(rawData: ArrayBuffer, url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.from(rawData);
      //let strData = '';
      let binaryString = Buffer.from('');
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (err: Error | undefined, zipfile: yauzl.ZipFile | undefined) => {
        if (err || !zipfile) {
          throw new Error(`[FeedService] A file returned by ${url} cannot be parsed as zip: ${err}`);
        }
        const fileCount = zipfile.entryCount || 0;
        if (fileCount === 0) {
          throw new Error(`[FeedService] An archive returned by ${url} is empty`);
        }
        zipfile.readEntry();
        zipfile.on('entry', (entry: yauzl.Entry) => {
          if (/\/$/.test(entry.fileName)) {
            // directory entry (Directory file names end with '/')
            zipfile.readEntry();
          } else {
            // file entry
            const outStream = new Writable({
              write(chunk, encoding, callback) {
                binaryString = Buffer.concat([binaryString, chunk]);
                //strData += chunk.toString();
                callback();
              },
              final(callback) {
                callback();
                resolve(binaryString);
              }
            });
            zipfile.openReadStream(entry, (err, stream) => {
              if (err) throw err;
              stream!.pipe(outStream);
            });
          }
        });
      });
    });
  }

  async loadHttpFile(feedInfo: FeedInfo): Promise<FeedData> {
    let params: GaxiosOptions = {
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip, deflate',
        // this doesn't work: validateStatus: (status: number) => true;  // it means "do not throw an exception on any http status" (we'll do it on ourselves)
      },
      // responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' | 'stream'; (default - text)
      responseType: 'blob', // do not change to json, because we need to process zip files as response
      url: feedInfo.url
    };
    let res;
    try {
      res = await request(params);
    }
    catch (e) {
      if (e.response) {
        const res = <GaxiosResponse>e.response;
        const msg = `[FeedService] Service ${feedInfo.url} returned error ${res.status} ${res.statusText}`;
        this.logger.error(msg + '. See details on the next line.');
        const resdata = await (<GaxiosError>e).response!.data.text();
        this.logger.error(resdata);
        let err = new Error(msg);
        //err['logged'] = true;
        throw err;
      }
      throw e;
    }

    let rawData = <Blob>res.data;

    return this.parseBlob(rawData, feedInfo);
  }

  async parseBuffer(rawData: Buffer, feedInfo: FeedInfo): Promise<FeedData> {
    // NOTE: this one is quite a copy-paste of parseBlob which is bad,
    // TODO: we need to find a way to merge them (probably migrate to Buffer for axious use-case as well)
    //       but let's wait till client-side implementation.
    let parsedUrl = new URL(feedInfo.url);
    let slashIdx = parsedUrl.pathname.lastIndexOf('/');
    let binaryString: Buffer | undefined;
    if (slashIdx > -1) {
      let fileName = parsedUrl.pathname.substring(slashIdx + 1);
      // NOTE: zip != gz those are two different formats
      if (fileName.endsWith('.zip')) {
        // for unziping we use yauzl package
        binaryString = await this.unzip(rawData, feedInfo.url);
      } else if (fileName.endsWith(".gz")) {
        // for ungzing we use built-in Node's zlib package
        binaryString = zlib.unzipSync(rawData);
      }
    }
    if (!binaryString) binaryString = rawData;
    // now decode binary string to a normal string
    let strData: string = '';
    if (feedInfo.charset) {
      strData = decode(binaryString, feedInfo.charset);
    } else {
      strData = binaryString.toString('utf8');
    }

    return this.parseFileContent(strData, feedInfo);
  }

  async parseBlob(rawData: Blob, feedInfo: FeedInfo): Promise<FeedData> {
    // NOTE: the behavior differs from one in v1 (AppScript)
    // The server can return a file as an archive, such as .zip, .gz, .tar.gz,
    // In such a case response's Content-Type can not to mention actual format, can be just 'application/binary'
    // So we need to parse a file's extension from the url to understand how to read the response.
    // On the other hand, the server can return a normal text content (JSON/CSV) but gzipped
    // (as we allowed it to do this via Accept-Encoding). But in such a case gaxios (and underlying node-fetch lib)
    // should ungzip response stream automatically
    let parsedUrl = new URL(feedInfo.url);
    let slashIdx = parsedUrl.pathname.lastIndexOf('/');
    let binaryString: Buffer | undefined;
    if (slashIdx > -1) {
      let fileName = parsedUrl.pathname.substring(slashIdx + 1);
      // NOTE: zip != gz those are two different formats
      if (fileName.endsWith('.zip')) {
        // for unziping we use yauzl package
        let buf = await rawData.arrayBuffer();
        binaryString = await this.unzip(buf, feedInfo.url);
      } else if (fileName.endsWith(".gz")) {
        // for ungzing we use built-in Node's zlib package
        let buf = await rawData.arrayBuffer();
        binaryString = zlib.unzipSync(buf);
      }
    }

    if (!binaryString) binaryString = Buffer.from(await rawData.arrayBuffer());
    // now decode binary string to a normal string
    let strData: string = '';
    if (feedInfo.charset) {
      strData = decode(binaryString, feedInfo.charset);
    } else {
      strData = binaryString.toString('utf8');
    }
    return this.parseFileContent(strData, feedInfo);
  }

  parseFileContent(strData: string, feedInfo: FeedInfo): FeedData {
    let feedType = feedInfo.type;
    if (feedType === FeedType.Auto) {
      if (feedInfo.url.endsWith('.json')) {
        feedType = FeedType.JSON;
      } else if (feedInfo.url.endsWith('csv')) {
        feedType = FeedType.CSV;
      } else {
        // TODO: we can try to detect the feed format (JSON vs CVS)
        throw new Error(`[FeedService] Feed ${feedInfo.name} has 'Auto' type, feed url doesn't have file extension, detecting format isn't supported`);
      }
    }
    this.logger.debug(`[FeedService] feed type detected as ${feedType}`);
    if (feedType === FeedType.JSON) {
      // the returned data is good JSON, and already parsed by gaxios
      // we expect that it's an array of object
      return this.parseJsonArray(strData, feedInfo);
    } else if (feedType === FeedType.JSONL) {
      let objects = strData.split('\n').filter(v => v && v.trim()).map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          this.logger.error(`[FeedService] Failed to parse JSON line: ${line}`);
          throw new Error(`[FeedService] The data returned by ${feedInfo.url} cannot be parsed as JSON: ${e}`);
        }
      });
      return this.convertObjectsToFeedData(objects, feedInfo);
    } else {
      return this.parseCsv(strData, feedInfo);
    }
    // TODO: feedInfo.type === FeedType.Auto
  }

  parseJsonArray(strData: string, feedInfo: FeedInfo): FeedData {
    try {
      let json = JSON.parse(strData);
      if (!Array.isArray(json))
        json = [json];
      if (_.isArray(json) && json.length) {
        return this.convertObjectsToFeedData(json, feedInfo);
      } else {
        // TODO: instead of throwing an error we could try to find a nested field with an array
        // TODO: ideally to support it via configuration,
        //  e.g. object_path_to_data="data", where data is a name of a field of the root object containing an array
        throw new Error(`[FeedService] The data returned by ${feedInfo.url} is not an array of object`)
      }
    } catch (e) {
      this.logger.error(`[FeedService] Failed to parse JSON string: ${strData}`);
      throw new Error(`[FeedService] The data returned by ${feedInfo.url} cannot be parsed as JSON: ${e}`);
    }
  }

  convertObjectsToFeedData(objects: Record<string, any>[], feedInfo: FeedInfo): FeedData {
    return new FeedData(/* feedInfo,  */objects);
  }

  /* Old solution for Array-based FeedData (see traverseObject in utils.ts):
    convertObjectsToFeedData(objects: any[], feedInfo: FeedInfo): FeedData {
      let columns: string[] = [];
      // traverse recursivly through the first object in supplied array (objects)
      // as result we'll get a list of columns and a mapping between column name to its index
      // we'll use this mapping later to flatten the whole array to avoid missing absent field,
      // So our assumption is that the first object in array contains ALL fields
      let column2idx: { [key:string]: number } = {};
      traverseObject(objects[0], (name, value, path, object) => {
        let field = path.join('.');
        column2idx[field] = columns.length;
        columns.push(field);
      }, []);

      let rows: any[][] = [];
      for (let i = 0; i < objects.length; i++) {
        const item = objects[i];
        let row: any[] = [];
        traverseObject(objects[0], (name, value, path, object) => {
          let field = path.join('.');
          let idx = column2idx[field];
          row[idx] = value;
        }, []);
        rows.push(row);
      }
      return new FeedData(feedInfo, columns, rows);
    }
   */

  parseCsv(strData: string, feedInfo: FeedInfo): FeedData {
    const csv = csv_parse(strData, {
      columns: true,
      skip_empty_lines: true
    });
    // csv: [{"column1": "obj1.value1", "column2": "obj1.value2"}, {"column1":"obj2.value1", "column2":"obj2.values2"} ]
    return new FeedData(/* feedInfo,  */csv, 'parseNumbers');

    // Old solution for array-based FeedData:
    // let columns: string[] = [];
    // for (const field in csv[0]) {
    //   columns.push(field);
    // }
    // let rows: any[][] = [];
    // for (let i = 0; i < csv.length; i++) {
    //   const item = csv[i];
    //   let row: any[] = [];
    //   for (const field of columns) {
    //     let val: any = item[field];
    //     // everything in CSV is text, try to parse numbers
    //     let parsed = tryParseNumber(val);
    //     if (parsed !== undefined)
    //       val = parsed;
    //     row.push(val);
    //   }
    //   rows.push(row);
    // }
    // return new FeedData(feedInfo, columns, rows);
  }

  loadFromGCS(feedInfo: FeedInfo): Promise<FeedData> {
    let parsed = new URL(feedInfo.url);
    let bucket = parsed.hostname;
    let filename = parsed.pathname.substring(1);

    return new Promise((resolve, reject) => {
      const storage = new Storage();
      let fileContents = Buffer.from('');
      storage.bucket(bucket).file(filename).createReadStream()
        .on('error', (err) => {
          reject(`[FeedService] Fetching a file ${feedInfo.url} from GCS failed with an error: ` + err);
        })
        .on('response', (response) => {

        })
        .on('data', (chunk) => {
          fileContents = Buffer.concat([fileContents, chunk]);
        })
        .on('end', () => {
          //let arrayBuf = fileContents.buffer.slice(fileContents.byteOffset, fileContents.byteOffset + fileContents.byteLength);
          //let content = fileContents.toString('utf8');
          //let feedData = this.parseFileContent(blob, feedInfo);
          //String.fromCharCode.apply(null, <any>new Uint16Array(rawData));
          //strData = rawData.toString('utf8');
          let feedData = this.parseBuffer(fileContents, feedInfo);
          resolve(feedData);
        });
    });
  }

  async loadFromDrive(feedInfo: FeedInfo): Promise<FeedData> {
    let fileContents: Buffer;
    try {
      fileContents = await GoogleDriveFacade.downloadFile(feedInfo.url);
    } catch (e) {
      console.error(`[GoogleDriveFacade] Fetching Google Drive file ${feedInfo.url} failed: ${e.message}`, e);
      e.logged = true;
      throw e;
    }
    let feedData = this.parseBuffer(fileContents, feedInfo);
    return feedData;
  }

  substituteUrlMacros(feedInfo: FeedInfo) {
    // replace macros in url (%y, %Y, %m, %d):
    const now = new Date();
    let day = now.getDay();
    let month = now.getMonth() + 1; // in JS month zero-based (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getMonth)
    let year = now.getFullYear();
    feedInfo.url = feedInfo.url
      .replace('%d', (day < 10 ? '0' : '') + day.toString())
      .replace('%m', (month < 10 ? '0' : '') + month.toString())
      .replace('%Y', year.toString())
      .replace('%y', year.toString().substring(2));
  }

  async loadFeed(feedInfo: FeedInfo): Promise<FeedData> {
    this.substituteUrlMacros(feedInfo);
    const url = feedInfo.url;
    this.logger.info(`[FeedService] Loading feed ${url}`);
    if (!url) {
      throw new Error(`[FeedService] Feed ${feedInfo.name} has incorrect url`);
    }
    let feed: Promise<FeedData>;
    if (feedInfo.type == FeedType.GoogleSpreadsheet || url.startsWith('https://docs.google.com/spreadsheets/')) {
      feed = this.loadSpreadsheet(feedInfo);
    }
    else if (feedInfo.type == FeedType.GoogleCloudBigQuery) {
      feed = this.loadBigQuery(feedInfo);
    }
    else {
      // direct link to file. type defined by the protocol: https, gs or drive
      const protocol = url.substring(0, url.indexOf(":")).toLocaleLowerCase().trim();
      if (protocol === 'http' || protocol === 'https') {
        feed = this.loadHttpFile(feedInfo);
      }
      else if (protocol === 'gs') {
        feed = this.loadFromGCS(feedInfo);
      }
      else if (protocol === 'drive') {
        feed = this.loadFromDrive(feedInfo);
      }
      else {
        throw new Error(`Unknown protocol '${url}' for feed '${feedInfo.name}'`);
      }
    }
    return feed;
  }

  private join(feedLeft: FeedData, feedRight: FeedJoinData): FeedData {
    let ext_key = feedRight.ext_key!;
    ext_key = ext_key.substring(ext_key.indexOf(".") + 1);
    // for each row in feedLeft join a row from feedRight
    // and remove rows in feedLeft for those we didn't find a corresponding row in feedRight
    if (!feedLeft.columns.includes(ext_key)) {
      throw new Error(`[FeedService] Feed ${feedRight.name} references an unknown column ${feedRight.ext_key}`);
    }
    let result = [];
    let lookup: Record<string, Record<string, any>> = {};
    for (let i = 0; i < feedRight.feed.rowCount; i++) {
      let rightRow = feedRight.feed.recordSet.values[i];
      lookup[rightRow[feedRight.key]] = rightRow;
    }
    for (let i = 0; i < feedLeft.rowCount; i++) {
      let leftRow = feedLeft.recordSet.values[i];
      let rightRow = lookup[leftRow[ext_key]];
      if (rightRow) {
        // found a row to join, combine them
        // We don't want to override properties (left to right or right to left),
        // so change their name by prepanding with feed name
        // TODO: do it for both feeds? Or only for right? Or only for conflicting fields? Or only for key?
        //let newRow = Object.assign({}, rightRow, leftRow);
        let duplicates: Record<string, any> = {}
        let newRow = _.assignInWith({}, leftRow, rightRow, (objVal: any, srcVal: any, key?: string, object?: {}, source?: {}) => {
          if (!_.isUndefined(objVal)) {
            duplicates[key!] = srcVal;
            return objVal;
          }
          return srcVal;
        });
        newRow['$' + feedRight.name] = Object.values(rightRow)
        _.forIn(duplicates, (val, key) => { newRow[feedRight.name + "." + key] = val });

        result.push(newRow);
      } // otherwise just skip it
    }
    if (feedLeft.recordSet.rowCount > 0 && result.length === 0) {
      throw new Error(`Joining '${feedRight.name}' feed produced no data`);
    }

    // // build an index for left feed by ext_key:
    // let lookup: Record<string, Record<string,any>> = {};
    // for(let i = 0; i < feedLeft.rowCount; i++) {
    //   let leftRow = feedLeft.recordSet.values[i];
    //   lookup[leftRow[ext_key]] = leftRow;
    // }
    // // go through the right feed and for each row look up a row in the index
    // let rightKey = feedRight.key;
    // for(let i = 0; i < feedRight.feed.rowCount; i++) {
    //   let rightRow = feedRight.feed.recordSet.values[i];
    //   let leftRow = lookup[rightRow[rightKey]];
    //   if (leftRow) {
    //     // found a row to join
    //     let newRow = Object.assign({}, rightRow, leftRow);
    //     result.push(newRow);
    //   } // otherwise just skip it
    // }
    return new FeedData(result);
  }

  private initArrayFields(feedName: string, feed: FeedData) {
    let rs = feed.recordSet;
    for (let row = 0; row < rs.rowCount; row++) {
      let obj = rs.getRow(row);
      obj['$' + feedName] = Object.values(obj);
    }
  }

  async loadAll(feedConfig: FeedConfig): Promise<FeedData> {
    if (!feedConfig.feeds || !feedConfig.feeds.length) {
      throw new Error("Feed configuration contains no feeds");
    }
    // load all feeds in parallel and wait for all to compelete
    let feeds: FeedInfoData[] = _.zip(
      feedConfig.feeds,
      await Promise.all(
        feedConfig.feeds.map((feedInfo) => this.loadFeed(feedInfo))
      )
    ).map(arr => ({ info: arr[0]!, feed: arr[1]! }));
    if (feeds.length === 1) {
      this.initArrayFields(feeds[0].info.name, feeds[0].feed);
      return feeds[0].feed;
    }
    // we have two or more feeds, need joining

    // build a map: feed name => feed data
    let feeds_src: Record<string, FeedData> = {};
    let feeds_dst: Record<string, { feed: FeedData, sources: Set<string> }> = {};
    feeds.forEach(f => feeds_src[f.info.name] = f.feed);
    this.logger.debug(`[FeedService] Joining ${feeds.length} feeds containing ${feeds.map(f => f.feed.rowCount)} rows`);

    // the main feed will be the one without external key
    let finalFeedName: string | undefined;
    for (const feed_ of feeds) {
      let feed = feed_.feed;
      let feedInfo = feed_.info;
      if (!feedInfo.external_key) {
        if (finalFeedName) {
          throw new Error(`[FeedService] Found another feed without external_ket ${feedInfo.name}, while only one is permitted`);
        }
        finalFeedName = feedInfo.name;
        feeds_dst[feedInfo.name] = { feed, sources: new Set<string>([feedInfo.name]) };
      }
    }
    if (!finalFeedName) { throw new Error(`[FeedService] Could find a feed with an external key`); } // shouldn't ever happen
    // for each row copy all fields into an array-field with name of the feed prepended by '$'
    this.initArrayFields(finalFeedName, feeds_dst[finalFeedName].feed);

    // loop though all other feeds
    for (const feed_ of feeds) {
      let feed = feed_.feed;
      let feedInfo = feed_.info;
      let feedName = feedInfo.name;
      let ext_key = feedInfo.external_key;
      if (!ext_key) continue;
      let ext_feed = ext_key.substring(0, ext_key.indexOf("."));
      if (ext_feed === feedInfo.name) {
        throw new Error(`[FeedService] Feed ${feedName} refers to itself in its external_key (${ext_key})`);
      }
      let left_src = feeds_dst[ext_feed]?.feed || feeds_src[ext_feed];
      if (!left_src) {
        throw new Error(`[FeedService] Feed ${feedName} refers to unknown feed ${ext_feed} in its external_key (${ext_key})`);
      }
      let right_src = feeds_dst[feedName]?.feed || feed;
      let new_src = this.join(left_src, { feed: right_src, name: feedInfo.name, key: feedInfo.key_column!, ext_key: feedInfo.external_key });

      let new_feed = { feed: new_src, sources: new Set([ext_feed, feedName]) };

      combineSources(feeds_dst, ext_feed, new_feed);

      combineSources(feeds_dst, feedName, new_feed);
    }

    // if we processed all feeds then elemnt counts in feeds_dst and feeds_src are equal
    let unprocessed = _.without(Object.keys(feeds_src), ...Object.keys(feeds_dst));
    if (unprocessed && unprocessed.length) {
      throw new Error(`[FeedService] There are feeds that weren't joined: ${unprocessed.join(', ')}`);
    }
    // there could be another case when all feeds are joined but not with the main one
    // basically at the end we expect all items in feeds_dst refers the same feed (the final one)

    // Old solution:
    //let finalFeed = feeds[0];
    // for (let i = 1; i < feeds.length; i++) {
    //   let feed = feeds[i];
    //   let ext_key = feed.feedInfo.external_key;
    //   this.join(finalFeed, feed);
    // }

    let finalFeed = feeds_dst[finalFeedName].feed;
    this.logger.info('[FeedService] All feeds were loaded and joined. Resulted number of rows: ' + finalFeed.rowCount);
    return finalFeed;
  }
}

function combineSources(feed_sources: Record<string, { feed: FeedData; sources: Set<string>; }>,
  feed_name: string,
  new_source: { feed: FeedData; sources: Set<string>; }) {
  let existing = feed_sources[feed_name];
  if (existing) {
    // copy feed names from existing source to the new source (new_feed)
    let other = [...existing.sources].filter(x => !new_source.sources.has(x));
    other.forEach(x => {
      new_source.sources.add(x);
      feed_sources[x] = new_source;
    });
  }
  feed_sources[feed_name] = new_source;
}

