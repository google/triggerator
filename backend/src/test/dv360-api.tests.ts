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
import assert from 'assert';
import DV360Facade from '../app/dv360-facade';
import winston from 'winston';

suite('DV360Facade', () => {
  test('downloadSdf: load sdf by campaign id', async function() {
    this.timeout(50000);
    let advertiserId = "506732";
    let campaignId = "3242703";

    let dv = new DV360Facade(winston);
    let sdf = await dv.downloadSdf(advertiserId, campaignId);
    console.log('Campaigns count: ' + JSON.stringify(sdf.campaigns?.rowCount));
    console.log('IOs count: ' + JSON.stringify(sdf.insertionOrders?.rowCount));
    console.log('LIs count: ' + JSON.stringify(sdf.lineItems?.rowCount));
    console.log('AdGroups count: ' + JSON.stringify(sdf.adGroups?.rowCount));
    console.log('Ads count: ' + JSON.stringify(sdf.ads?.rowCount));
    let campaign = sdf.campaigns.getRow(0);

    assert.deepStrictEqual(campaign['Advertiser Id'], advertiserId);
    assert.deepStrictEqual(campaign['Campaign Id'], campaignId);
    // Campaign Id,Advertiser Id,Name,Timestamp,Status
    // 3242703,506732,New triggerator campaign 4,2019-08-15T15:03:18.090000,Active
    //    ,Raise awareness of my brand or product,CPM,1,display; video;,1,08/16/2019 00:00,,False,0,Minutes,0,,,,,,,,,,Do not block,,None,,,,,,,Authorized and Non-Participating Publisher,1; 6; 8; 9; 10; 2; 11; 12; 13; 17; 20; 21; 23; 27; 30; 31; 34; 35; 36; 37; 38; 41; 42; 46; 48; 50; 52; 56; 60; 63; 65; 70; 67; 74; 75; 77; 78; 82; 85; 90; 93;,16; 51;,True,
  });
});