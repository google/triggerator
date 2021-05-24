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
import assert from 'assert';
import { Config, FeedInfo, FeedType } from '../types/config';
import { RuleEvaluator } from '../app/rule-engine';
import { FeedData, RecordSet, SdfFull } from '../types/types';

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

suite("RuleEvaluator", function () {
  test("Simple rules evaluation", async function() {
    let rules = [
      { name: "Above zero", condition: "temp >=0", display_state: {bid: 100, frequency_li: "1/day", frequency_io: "1/day"} },
      { name: "Below zero", condition: "temp < 0" , display_state: {bid: 1, frequency_li: "1/week", frequency_io: "1/week"} }
    ];
    let data = getFeedData();
    let evaluator = new RuleEvaluator();
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(0))!.name, "Above zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(1))!.name, "Above zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(2))!.name, "Above zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(3))!.name, "Below zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(4))!.name, "Below zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(5))!.name, "Below zero");
  });

  test("", async function () {
    this.skip();
    /*
    let advertiserId = "506732";
    let campaignId = "TODO";
    let config: Config = {
      execution: {
        advertiserId: advertiserId,
        campaignId: campaignId,
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
    };
    let dv_facade = new DV360Facade({useLocalCache: true});
    let ruleEngine = new RuleEngine(config, dv_facade, {dontUpdate: true});
    let feedData = getFeedData();
    let sdf = await dv_facade.downloadSdf(advertiserId, campaignId);
    ruleEngine.run(feedData, sdf);
    console.log(ruleEngine.updateLog);
    */
  });
});