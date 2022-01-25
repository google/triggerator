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
import fs from 'fs';
import { Config, FeedInfo, FeedType } from '../types/config';
import DV360Facade, { SdfDownloadOptions } from '../app/dv360-facade';
import { RuleEvaluator } from '../app/rule-engine';
import SdfService from '../app/sdf-service';
import { FeedData, RecordSet, SdfFull } from '../types/types';
import winston from 'winston';

/**
 * ============================================================================
 * WARNING: these tests assume existing of some objects (campaigns/IO/LI) in DV360
 * All of them exist in test advertiser with id = 506732.
 * ============================================================================
 */
    /*
    let dv_facade: DV360Facade = {
      async updateInsertionOrderStatus(advertiserId: string, ioId: string, status: 'active' | 'paused') {},
      async updateLineItemStatus(advertiserId: string, liId: string, status: 'active' | 'paused') {},
      async downloadSdf(advertiserId: string, campaignId: string, options?: SdfDownloadOptions | null): Promise<SdfFull> {
        return {
          advertiserId: advertiserId,
          campaigns: RecordSet. ,
          insertionOrders,
          lineItems,
          adGroups,
          ads
        };
      }
    };
    */

suite('SdfService', function() {
  this.timeout(50000);

  function getFeedData(): FeedData {
    let values = [
      { id: 1, name: 'Moscow', temp: 0},
      { id: 2, name: 'Saint-Petersburg', temp: 1},
      { id: 3, name: 'Nizniy Novgorod', temp: 2},
      { id: 4, name: 'Samara', temp: -3},
      { id: 5, name: 'Vladivostok', temp: -10},
      { id: 6, name: 'Irkutsk', temp: -20},
    ];
    let dataFeed = new FeedData(values);
    return dataFeed;
  }

  test('Create a new SDF:IO per feed row', async function() {
    // generate SDF from template campaign with one single IO (without LIs)
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
        template_campaign: "3237246", // see https://displayvideo.google.com/#ng_nav/p/100832/a/506732/c/3237246
        campaign_name: "TRGR: Test campaign (SdfService unit-tests)",
        io_template: "io-{base_name}-{row_name}",
        li_template: "not used",
        yt_li_template: "not used",
        yt_io_template: "not used",
        adgroup_template: "not used",
        ad_template: "not used"
      }
    };
    let dv_facade = new DV360Facade(winston, {useLocalCache: true});
    let ruleEvaluator = new RuleEvaluator();
    let sdf_svc = new SdfService(config, winston, ruleEvaluator, dv_facade);
    let dataFeed = getFeedData();
    let sdf = await sdf_svc.generateFromTemplate(dataFeed, false, true, new Date(), new Date());
    assert.strictEqual(sdf.insertionOrders.rowCount, dataFeed.rowCount, "Expect IO by feed row");
  });

  test('Create a new SDF:IO per feed row and rule', async function() {
    // generate SDF from template campaign with one single IO (without LIs)
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
        template_campaign: "3237246", // see https://displayvideo.google.com/#ng_nav/p/100832/a/506732/c/3237246
        campaign_name: "TRGR: Test campaign (SdfService unit-tests)",
        io_template: "io-{base_name}-{row_name}-{rule_name}",
        li_template: "not used",
        yt_li_template: "not used",
        yt_io_template: "not used",
        adgroup_template: "not used",
        ad_template: "not used"
      }
    };
    let dv_facade = new DV360Facade(winston, {useLocalCache: true});
    let ruleEvaluator = new RuleEvaluator();
    let sdf_svc = new SdfService(config, winston, ruleEvaluator, dv_facade);
    let dataFeed = getFeedData();
    let sdf = await sdf_svc.generateFromTemplate(dataFeed, false, true, new Date(), new Date());
    assert.strictEqual(sdf.insertionOrders.rowCount, dataFeed.rowCount * 2, "Expect one IO per feed row count and rules multiplication");
  });

  test("Create a new SDF:", async function () {
    // generate SDF from template campaign with several IO each of them has a LI (both Display and TrueView)
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
        yt_io_template: "{base_name}-{row_name}-{rule_name}",
        adgroup_template: "not used",
        ad_template: "not used"
      }
    };
    let dv_facade = new DV360Facade(winston, {useLocalCache: true});
    let ruleEvaluator = new RuleEvaluator();
    let sdf_svc = new SdfService(config, winston, ruleEvaluator, dv_facade);
    let dataFeed = getFeedData();
    let sdf = await sdf_svc.generateFromTemplate(dataFeed, false, true, new Date(), new Date());
    let filePath = await sdf_svc.exportSdf(sdf);
    assert.strictEqual(fs.existsSync(filePath), true);

    console.log(sdf.insertionOrders.rowCount);
    console.log(sdf.lineItems!.rowCount);
    // NOTE: 2 - it's the number of IOs in template campaign
    let expected_li_count = dataFeed.rowCount * config.rules!.length * 2;
    assert.strictEqual(sdf.lineItems!.rowCount, expected_li_count);
  });

  /** Test plan:
   * Variations:
   * 1. template IO is non-TrV and doesn't depend on feed (no {row_name} in its name template)
   * 2. template IO is non-TrV but depends on feed (has {row_name} in its name template)
   * 3. template IO is TrV and ---TODO: what? can it depend and not depend? or shoult only depend or only not to depend?
   *
   */
});