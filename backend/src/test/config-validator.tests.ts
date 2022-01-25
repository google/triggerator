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
import { FeedType, Config, SdfElementType } from '../types/config';
import ConfigValidator from '../app/config-validator';
import { FeedData, RecordSet } from '../types/types';

suite('ConfigValidator', () => {
  test('validate feeds config: feed should be specified', function () {
    // no feeds
    let errors = ConfigValidator.validateFeeds({});
    assert.strictEqual(errors.length, 1);
    // no feeds
    errors = ConfigValidator.validateFeeds({ feeds: [] });
    assert.strictEqual(errors.length, 1);
  });

  test('validate feeds config: required fields', function () {
    // no name column specified
    let errors = ConfigValidator.validateFeeds({ feeds: [{ type: FeedType.Auto, url: 'url', name: "feed1" }] });
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].message, "Feed name column is not specified");
  });

  test('validate feeds config: only one feed can be without external key', () => {
    let config = {
      name_column: "name",
      feeds: [
        { type: FeedType.Auto, url: 'url', name: "feed1" },
        { type: FeedType.Auto, url: 'url', name: "feed2" }
      ]
    };
    let errors = ConfigValidator.validateFeeds(config);
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].message, "Found several feeds without external key");
  });

  test('validate feeds config: one feed should be without external key', () => {
    let config = {
      name_column: "name",
      feeds: [
        { type: FeedType.Auto, url: 'url', name: "feed1", external_key: "feed2.id", key_column: "id" },
        { type: FeedType.Auto, url: 'url', name: "feed2", external_key: "feed1.id", key_column: "id" },
      ]
    };
    let errors = ConfigValidator.validateFeeds(config);
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].message, "Among several feeds there should be one and only one without external key");
  });

  test('validate feeds config: feed with external key should have key_column', () => {
    let config = {
      name_column: "name",
      feeds: [
        { type: FeedType.Auto, url: 'url', name: "feed1" },
        { type: FeedType.Auto, url: 'url', name: "feed2", external_key: "feed1.id" },
      ]
    };
    let errors = ConfigValidator.validateFeeds(config);
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0].message, "The 'feed2' feed has an external key but has no key column");
  });

  test('validateGeneratingConfiguration', function () {
    let config: Config = {
      title: 'test',
      execution: {
        advertiserId: "506732"
      },
      feedInfo: {
        name_column: "name",
        geo_code_column: "geo_code",
        budget_factor_column: "budget",
        feeds: []
      },
      customFields: [],
      dv360Template: {},
      rules: []
    };
    let feedData: FeedData = new FeedData([{ name: 'name1', geo_code: '1', budget: 1 }]);
    let errors = ConfigValidator.validateGeneratingRuntimeConfiguration(config, feedData);
    assert.deepStrictEqual(errors, []);

    feedData = new FeedData([{ name1: 'name1', geo_code1: '1', budget1: 1 }]);
    errors = ConfigValidator.validateGeneratingRuntimeConfiguration(config, feedData);
    assert.strictEqual(errors.length, 3);
  });
});