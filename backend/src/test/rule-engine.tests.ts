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
    evaluator.validateRule(rules[0]);
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(0))!.name, "Above zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(1))!.name, "Above zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(2))!.name, "Above zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(3))!.name, "Below zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(4))!.name, "Below zero");
    assert.strictEqual(evaluator.getActiveRule(rules, data.getRow(5))!.name, "Below zero");
  });

  test("Comparison operations", function () {
    let evaluator = new RuleEvaluator();
    // verify that all comparison operations for numbers work
    assert.strictEqual(evaluator.evaluateExpression("1 == 1", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("1 != 0", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("1 > 0", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("1 >= 0", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("1 < 0", {}), false);
    assert.strictEqual(evaluator.evaluateExpression("1 <= 0", {}), false);
    // verify that all comparison operations for strings work
    assert.strictEqual(evaluator.evaluateExpression("'value' == value", { value: 'value' }), true);
    assert.strictEqual(evaluator.evaluateExpression("'abc' != 'xyz'", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("'abc' < 'xyz'", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("'abc' > 'xyz'", {}), false);
    // verify add/substruct
    //  for numbers:
    assert.strictEqual(evaluator.evaluateExpression("100 - 10 + 2 > 0", {}), true);
    //  for strings:
    assert.strictEqual(evaluator.evaluateExpression("'hello' + ' ' + 'world'", {}), 'hello world');
  });

  test("Date and time expressions", function () {
    let evaluator = new RuleEvaluator();
    let now = new Date();
    let yesterday = new Date(now.valueOf() - (24 * 60 * 60 * 1000) * 1);
    let str_yesterday = `${yesterday.getFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`;
    // console.log(evaluator.evaluateExpression("today() - period('P1D')", {}));
    // console.log(evaluator.evaluateExpression("date($date, 'yyyy-M-dd')", { $date: str_yesterday }));
    // assert.strictEqual(evaluator.evaluateExpression("date('2021-09-22').toString()", {}), "2021-09-22");
    assert.strictEqual(evaluator.evaluateExpression("today() - period('P1D') == date($date, 'yyyy-M-dd')", { $date: str_yesterday}), true);
    assert.strictEqual(evaluator.evaluateExpression("today() - period('P1D') < today()", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("today() + period('P1D') > today()", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("now() - duration('PT1H') < now()", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("now() + duration('PT1H') > now()", {}), true);
    assert.strictEqual(evaluator.evaluateExpression("now() >= datetime('2021-09-22T00:01:03')", {}), true);
  });
});