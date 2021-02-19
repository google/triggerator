import assert from 'assert';
import { Config, FeedInfo, FeedType } from '../types/config';
import DV360Facade, { SdfDownloadOptions } from '../app/dv360-facade';
import RuleEngine, { RuleEvaluator } from '../app/rule-engine';
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