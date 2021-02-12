import { URL } from 'url';
import { Writable } from 'stream';
import zlib from 'zlib';
import _ from 'lodash';
import { GaxiosError, GaxiosOptions, GaxiosResponse, request } from 'gaxios';
import yauzl from 'yauzl';
import { FeedConfig, FeedInfo } from "./config";
import { sheets_v4, google } from 'googleapis';
import { Storage } from '@google-cloud/storage';
import csv_parse from 'csv-parse/lib/sync';

import FeedData from "./feeddata";

export function traverseObject(object: any,
  visitor: (name: string, value: any, path: string[], object: Object) => void,
  path: string[]
): boolean {
  path = path || [];
  return _.forIn(object, function (value: any, name: string) {
    path.push(name);
    if (_.isPlainObject(value)) {
      traverseObject(value, visitor, path);
    } else if (value === null || value === undefined || _.isString(value) || _.isNumber(value) || _.isBoolean(value)) {
      visitor(name, value, path, object);
    } else if (_.isArray(value)) {
      for (const idx in value) {
        path.push(idx);
        traverseObject(value[idx], visitor, path);
        path.pop();
      }
    }
    path.pop();      
  });
}

function tryParseNumber(str: any): number | undefined {
  if (_.isFinite(str))
    return <number>str;
  if (str !== null) {
      if(str.length > 0) {
          if (!isNaN(str)) {
              let num = Number(str);
              return isNaN(num) ? undefined : num;
          }
      }
  }
}

export default class FeedService {
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
      let spreadsheet = await sheetsAPI.spreadsheets.get({
        spreadsheetId: spreadsheetId,
        includeGridData: false
      });
      let sheets = spreadsheet.data.sheets;
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
    console.log(`[FeedService] Loading value for spreadsheet ${spreadsheetId} in range ${rangeName}`);
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
    for (let i = 0; i < values.length; i++) {
      let row = values[i];
      for (let j = 0; j < row.length; j++) {
        let val = row[j];
        let parsed = tryParseNumber(val);
        if (parsed !== undefined)
          row[j] = parsed;
      }
    }
    return new FeedData(feedInfo, columns, values);
  }

  unzip(rawData: ArrayBuffer, url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = Buffer.from(rawData);
      let strData = '';
      yauzl.fromBuffer(buffer, {lazyEntries:true}, (err: Error | undefined, zipfile: yauzl.ZipFile | undefined) => {
        if (err || !zipfile) {
          throw new Error(`[FeedService] A file returned by ${url} cannot be parsed as zip`);
        }
        const fileCount = zipfile.entryCount || 0;
        if (fileCount === 0) {
          throw new Error(`[FeedService] An archive return by ${url} is empty`)
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
                strData += chunk.toString();
                callback();
              },
              final(callback) {
                resolve(strData);
              }
            });
            zipfile.openReadStream(entry, (err, stream) => {
              if (err) throw err;
              stream?.pipe(outStream);
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
        // NOTE: gaxious will add Accept: application/json for us if responseType='json'
        'Accept-Encoding': 'gzip, deflate',
        // TODO: this doesn't work: validateStatus: (status: number) => true;  // it means "do not throw an exception on any http status" (we'll do it on ourselves)
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
      console.log(e)
      if (e.response) {
        const res = <GaxiosResponse>e.response;
        const msg = `[FeedService] Service ${feedInfo.url} returned error ${res.status} ${res.statusText}`;
        console.log(msg + '. See details in next line.');
        const resdata = await (<GaxiosError>e).response?.data.text();
        console.log(resdata);
        throw new Error(msg);
      }
      throw e;
    }
    /*if (res.status != 200 && res.status != 204) {
      const msg = `[FeedService] Service ${feedInfo.url} returned error ${res.status} ${res.statusText}`;
      console.log(msg + '. See details in next line.');
      console.log(res.data);
      throw new Error(msg);
    }*/

    let rawData = <Blob>res.data; //await (<Blob>res.data).arrayBuffer();
    let strData: string = '';
    // NOTE: the behavior differs from one in v1 (AppScript)
    // The server can return a file as an archive, such as .zip, .gz, .tar.gz,
    // In such a case response's Content-Type can not to mention actual format, can be just 'application/binary'
    // So we need to parse a file's extension from the url to understand how to read the response.
    // On the other hand, the server can return a normal text content (JSON/CSV) but gzipped 
    // (as we allowed it to do this via Accept-Encoding). But in such a case gaxios (and underlying node-fetch lib)
    // should ungzip response stream automatically
    let parsedUrl = new URL(feedInfo.url);
    let slashIdx = parsedUrl.pathname.lastIndexOf('/');
    if (slashIdx > -1) {
      let fileName = parsedUrl.pathname.substring(slashIdx + 1);
      // NOTE: zip != gz those are two different formats
      if (fileName.endsWith('.zip')) {
        // for unziping we use yauzl package
        let buffer = await rawData.arrayBuffer();
        strData = await this.unzip(buffer, feedInfo.url);
      } else if (fileName.endsWith(".gz")) {
        // for ungzing we use built-in Node's zlib package
        let buffer = await rawData.arrayBuffer();
        strData = zlib.unzipSync(buffer).toString('utf8');
      }
    }
    if (!strData) {
      strData = await rawData.text();
    }
    return this.parseFileContent(strData, feedInfo);

    /* packages for unzip:
    unzip - https://github.com/EvanOxfeld/node-unzip - DO NOT USE IT (8 years old shit)
      (uses old fsteam, than depends on old graceful-fs which depends on natives which is incompatible with Node > 11)
    yauzl - https://github.com/thejoshwolfe/yauzl
    unzip-stream - https://www.npmjs.com/package/unzip-stream - But ZIP format doesn't support streaming, so why?
    decompress-zip - https://github.com/bower/decompress-zip - Only files
     */
  }

  parseFileContent(content: string, feedInfo: FeedInfo): FeedData {
    if (feedInfo.type === 'JSON') {
      // the returned data is good JSON, and already parsed by gaxios
      // we expect that it's an array of object
      return this.parseJson(content, feedInfo);
    } else {
      return this.parseCsv(content, feedInfo);
    }
  }

  convertObjectsToValues(objects: any[], feedInfo: FeedInfo): FeedData {
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

  parseJson(strData: string, feedInfo: FeedInfo): FeedData {
    try {
      let json = JSON.parse(strData);
      if (!Array.isArray(json))
        json = [json];
      if (_.isArray(json) && json.length) {
        return this.convertObjectsToValues(json, feedInfo);
      } else {
        // TODO: instead of throwing an error we could try to find a nested field with an array
        // TODO: ideally to support it via configuration,
        //  e.g. object_path_to_data="data", where data is a name of a field of the root object containing an array
        throw new Error(`[FeedService] The data returned by ${feedInfo.url} is not an array of object`)
      }
    } catch (e) {
      throw new Error(`[FeedService] The data returned by ${feedInfo.url} cannot be parsed as JSON`);
    }
  }

  parseCsv(strData: string, feedInfo: FeedInfo): FeedData {
    const csv = csv_parse(strData, {
      columns: true,
      skip_empty_lines: true
    });
    // [{"column1": "obj1.value1", "column2": "obj1.value2"}, {"column1":"obj2.value1", "column2":"obj2.values2"} ]
    let columns: string[] = [];
    for (const field in csv[0]) {
      columns.push(field);
    }
    let rows: any[][] = [];
    for (let i = 0; i < csv.length; i++) {
      const item = csv[i];
      let row: any[] = [];
      for (const field of columns) {
        let val: any = item[field];
        // everything in CSV is text, try to parse numbers
        let parsed = tryParseNumber(val);
        if (parsed !== undefined)
          val = parsed;
        row.push(val);
      }
      rows.push(row);
    }
    return new FeedData(feedInfo, columns, rows);
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
        .on('data', (chunk) => {
          fileContents = Buffer.concat([fileContents, chunk]);
        })
        .on('end', () => {
          let content = fileContents.toString('utf8');
          let feedData = this.parseFileContent(content, feedInfo);
          resolve(feedData);
        });
    });
  }

  async loadFromDrive(feedInfo: FeedInfo): Promise<FeedData> {
    throw new Error('Not implemented');
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
    console.log(`[FeedService] Loading feed ${url}`);
    if (!url) {
      throw new Error(`[FeedService] Feed ${feedInfo.name} has incorrect url`);
    }
    let feed: Promise<FeedData>;
    if (feedInfo.type == 'Google Spreadsheet') {
      feed = this.loadSpreadsheet(feedInfo);
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
        throw new Error(`Unknown protocol ${url} for feed ${feedInfo.name}`);
      }
    }
    return feed;
    //return feed.then(this.processFeed);
  }

  private processFeed(feed: FeedData): FeedData {
    // prepend column names with the feed name
    for (let i = 0; i < feed.columns.length; i++) {
      feed.columns[i] = feed.name + "." + feed.columns[i];
    }
    return feed;
  }

  private join(feed: FeedData, feedRight: FeedData) {
    let externalKey = feedRight.feedInfo.external_key;

    // TODO: implement join
    // (this.processFeed);
  }

  async loadAll(feedConfig: FeedConfig): Promise<FeedData> {
    if (!feedConfig.feeds.length) {
      throw new Error("Feed configuration contains no feeds");
    }
    // load all feeds in parallel and wait for all to compelete
    let feeds = await Promise.all(
      feedConfig.feeds.map((feedInfo) => this.loadFeed(feedInfo))
    );
    if (feeds.length === 1)
      return feeds[0];
    // we have two or more feeds, need joining
    let finalFeed = feeds[0];
    for (let i = 1; i < feeds.length; i++) {
      let feed = feeds[i];
      this.join(finalFeed, feed);
    }

    console.log('All feeds loaded. Number of rows: ' + finalFeed.rowCount);
    return finalFeed;
  }

}