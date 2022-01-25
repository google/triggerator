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
import { google } from 'googleapis';
import ConfigService from '../app/config-service';
import FeedService from '../app/feed-service';
import { Config, FeedInfo, FeedType } from '../types/config';
import { authorizeAsync } from './auth';
import DV360Facade from '../app/dv360-facade';
import SdfService from '../app/sdf-service';
import { RuleEvaluator } from '../app/rule-engine';
import { FeedData } from '../types/types';
import { OAUTH_SCOPES } from '../consts';
import winston from 'winston';
import SchedulerService from '../app/cloud-scheduler-service';

winston.add(new winston.transports.Console());

async function test_sdf_download() {
  let campaignId = 3242703;
  const dv_api = google.displayvideo({ version: "v1" });

  let resourceName;// = 'sdfdownloadtasks/media/9025585';
  if (!resourceName) {
    let op = (await dv_api.sdfdownloadtasks.create({
      requestBody: {
        // request body parameters
        // {
        "advertiserId": "506732",
        //   "idFilter": {},
        //   "inventorySourceFilter": {},
        "parentEntityFilter": {
          "fileType": [
            "FILE_TYPE_CAMPAIGN",
            "FILE_TYPE_INSERTION_ORDER",
            "FILE_TYPE_LINE_ITEM",
            "FILE_TYPE_AD_GROUP",
            "FILE_TYPE_AD"
          ],
          "filterType": "FILTER_TYPE_CAMPAIGN_ID",
          "filterIds": [campaignId.toFixed()]
        },
        //   "partnerId": "my_partnerId",
        //   "version": "my_version"
        // }
      },
    })).data;
    if (op.error) {
      throw new Error(op.error!.message || op.error!.code?.toFixed() || op.error.details!.join().toString());
    }
    const op_name = op.name!;
    console.log('SdfDownload task created: ' + op_name);
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    let started = Date.now();
    console.log(started);
    while (true) {
      op = (await dv_api.sdfdownloadtasks.operations.get({ name: op_name })).data;
      console.log(`[${Date.now()}] Fetch op status: done=${op.done}, response=${op.response}`);
      if (op.error) {
        throw new Error(op.error!.message || op.error!.code?.toFixed() || op.error.details!.join().toString());
      }
      if (op.done) break;
      sleep(1000);
      if (Date.now() - started > 50000)
        throw new Error(`Operation ${op_name} timed out`);
    }
    resourceName = op.response!.resourceName;
  }
  console.log(`Operation is done, resourceName=${resourceName}`);
  // let res = (await dv_api.media.download({ resourceName: resourceName, alt:'media' }, {responseType: 'blob'}));
  // let data = <Blob>res.data;
  // let arrayBuf = await data.arrayBuffer();
  // let buf = Buffer.from(arrayBuf);
  // fs.writeFileSync('response.bin', buf);
  //let res = (await dv_api.media.download({ resourceName: resourceName, alt:'media' }));

  let res = (await dv_api.media.download({ resourceName: resourceName, alt:'media' }, {responseType: 'stream'}));
  let stream = res.data;
  stream.pipe(fs.createWriteStream('sdf.zip'));
  //fs.writeFileSync('response.stream', data);
  //console.log(JSON.stringify(res));
}

/* DBP API deprecated
async function test_sdf_download_dbm(campaignId: string) {
  const dbm_api = google.doubleclickbidmanager({version: "v1.1"})
  let sdf = (await dbm_api.sdf.download({
    //auth: auth,
    requestBody: {
      fileTypes: ["CAMPAIGN"],
      filterType: "CAMPAIGN_ID",
      filterIds: [campaignId]
    }
  })).data;
  console.log(JSON.stringify(sdf));
}
*/

async function test_config_service() {
  const spreadsheetId = '1KkKLHlxBEEhdLsxjK9RXSh9I7eO6bJinxZsi1XgjsBI';//'1Zf5MpraZTY8kWPm8is6tAAcywsIc3P-X_acwIwXRAhs';
  let configService = new ConfigService(winston);
  let config = await configService.loadConfiguration(spreadsheetId);
  console.log(JSON.stringify(config));

  let feedSvc = new FeedService(winston);
  let data = await feedSvc.loadAll(config.feedInfo!);
  console.log(data);
}

async function test_feed_service_gcs() {
  let feedService = new FeedService(winston);
  let feedInfo: FeedInfo = {
    name: 'test',
    url: 'gs://triggerator-tests/weather.json',
    type: FeedType.JSON,
    key_column: 'city.id'
  };
  let feedData = await feedService.loadFeed(feedInfo);
  console.log(JSON.stringify(feedData));
}

async function generate_sdf_from_template() {
  let config: Config = {
    execution: {
      advertiserId: "506732",
      campaignId: "",
    },
    feedInfo: {
      name_column: "name",
      feeds: [
        { name: "main", url: "", type: FeedType.JSON, key_column: "id" }
      ]
    },
    rules: [
      { name: "Above zero", condition: "temp >=0", display_state: {bid: 100, frequency_li: "1/day", frequency_io: "1/day"} },
      { name: "Below zero", condition: "temp <0" , display_state: {bid: 1, frequency_li: "1/week", frequency_io: "1/week"} }
    ],
    dv360Template: {
      template_campaign: "3420942", // see https://displayvideo.google.com/#ng_nav/p/100832/a/506732/c/3420942/
      campaign_name: "TRGR: Test campaign (SdfService unit-tests)",
      io_template: "{base_name}-{row_name}",
      li_template: "{base_name}-{row_name}-{rule_name}",
      yt_li_template: "{base_name}-{row_name}-{rule_name}",
      yt_io_template: "{base_name}-{row_name}",
      adgroup_template: "not used",
      ad_template: "not used"
    }
  };
  let dv_facade = new DV360Facade(winston, {useLocalCache: true});
  let ruleEvaluator = new RuleEvaluator();
  let sdf_svc = new SdfService(config, winston, ruleEvaluator, dv_facade);
  let values = [
    { id: 1, name: 'Moscow', temp: 0},
    { id: 2, name: 'Saint-Petersburg', temp: 1},
    { id: 3, name: 'Nizniy Novgorod', temp: 2},
    { id: 4, name: 'Samara', temp: -3},
    { id: 5, name: 'Vladivostok', temp: -10},
    { id: 6, name: 'Irkutsk', temp: -20},
  ];
  let dataFeed = new FeedData(values);
  await sdf_svc.generateSdf(dataFeed, {});
}

async function test_drive() {
  let feedSvc = new FeedService(winston);
  let feedData = await feedSvc.loadFromDrive({
    url: 'drive://1JWz87cdPk74tEYBPDQoG8-BVTFO_aQyk/weather.json',
    name: 'test',
    type: FeedType.JSON,
    key_column: 'city.id'
  });
  console.log(JSON.stringify(feedData));

  // const drive = google.drive('v3');
  // const res = await drive.files.list({
  //   //mimeType='application/vnd.google-apps.folder'
  //   q: "name = 'GOPR0036.JPG' and '17DiM74xInwCszOkt45CuCBvxlWEW1XRF' in parents",
  //   fields: 'files(id, name)',
  //   spaces: 'drive',
  // });
  // console.log(res.data);
}

async function test_getJobList() {
  let svc = new SchedulerService(winston);
  let jobs = await svc.getJobList();
  console.log(jobs);
}

async function main() {

  const keyFile = path.resolve(__dirname, '../../keys/triggerator-sd-sa.json');
  const auth = await new google.auth.GoogleAuth({
    keyFile: keyFile,
    scopes: OAUTH_SCOPES
  });
/*
  let cred_file = path.resolve(__dirname, 'credentials.json');
  console.log(cred_file);
  let credentials = JSON.parse(fs.readFileSync(cred_file, 'utf8'));
  let auth = await authorizeAsync(credentials);
*/
  google.options({
    auth: auth
  });

  await test_getJobList();
  //await generate_sdf_from_template();
}

main().catch(console.error);
