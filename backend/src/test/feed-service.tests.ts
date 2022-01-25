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
import http from 'http';
import assert from 'assert';
import FeedService from '../app/feed-service';
import { FeedConfig, FeedInfo, FeedType } from '../types/config';
import { FeedData } from '../types/types';
import winston from 'winston';

class FeedServiceTester {
  server: http.Server;
  port = 9000;

  constructor() {
    let basepath = path.resolve(__dirname);
    this.server = http.createServer(function (req, res) {

      fs.readFile(basepath + req.url, function (err, data) {
        if (err) {
          res.writeHead(404);
          res.end(JSON.stringify(err));
          return;
        }
        res.writeHead(200);
        res.end(data);
      });
    });
  }

  start() {
    this.server.listen(this.port);
  }

  shutdown() {
    this.server.close();
  }

  getHttpUrl(filename: string) {
    return `http://localhost:${this.port}/${filename}`;
  }
}

suite('FeedService', () => {
  function assertWeatherJson(feedData: FeedData) {
    /* weather.json is:
    {"city":{"id":524901,"name":"Moscow","findname":"MOSCOW","country":"RU","coord":{"lon":37.615555,"lat":55.75222},"zoom":1},
      "time":1611331348,
      "sunrise":1611294012,
      "sunset":1611322902,
      "main":{"temp":271.18,"feels_like":266.12,"pressure":1008,"humidity":100,"temp_min":270.93,"temp_max":271.48},
      "visibility":2900,
      "wind":{"speed":4,"deg":190},
      "clouds":{"all":90},
      "weather":[{"id":701,"main":"Mist","description":"mist","icon":"50n"}],
      "uvi":0.42},
     */
    // Old solution for Array-based FeedData:
    // assert.strictEqual(feedData.columns.length, 25, 'column create for each primitive value in nested json');
    // assert.deepStrictEqual(feedData.columns, [
    //   "city.id","city.name","city.findname","city.country","city.coord.lon","city.coord.lat","city.zoom",
    //   "time","sunrise","sunset","main.temp","main.feels_like","main.pressure","main.humidity","main.temp_min","main.temp_max",
    //   "visibility","wind.speed","wind.deg",
    //   "clouds.all","weather.0.id","weather.0.main","weather.0.description","weather.0.icon","uvi"
    //   ]);
    // assert.deepStrictEqual(feedData.values[0], [
    //   524901,"Moscow","MOSCOW","RU",37.615555,55.75222,1,
    //   1611331348,1611294012,1611322902,271.18,266.12,1008,100,270.93,271.48,
    //   2900,4,190,90,701,"Mist","mist","50n",0.42
    // ]);
    let row = feedData.getRow(0);
    assert.deepStrictEqual(row, {
      "city": { "id": 524901, "name": "Moscow", "findname": "MOSCOW", "country": "RU", "coord": { "lon": 37.615555, "lat": 55.75222 }, "zoom": 1 },
      "time": 1611331348,
      "sunrise": 1611294012,
      "sunset": 1611322902,
      "main": { "temp": 271.18, "feels_like": 266.12, "pressure": 1008, "humidity": 100, "temp_min": 270.93, "temp_max": 271.48 },
      "visibility": 2900,
      "wind": { "speed": 4, "deg": 190 },
      "clouds": { "all": 90 },
      "weather": [{ "id": 701, "main": "Mist", "description": "mist", "icon": "50n" }],
      "uvi": 0.42
    }
    );
  }

  function assertWeatherCsv(feedData: FeedData) {
    /* weather.csv is:
    "city","today_temp","tomorrow_temp"
    "Moscow",-10,0
    "Nizhniy Novgorod",-15,-20
      */
    // assert.deepStrictEqual(feedData.columns, ["city", "today_temp", "tomorrow_temp"]);
    // assert.deepStrictEqual(feedData.values, [["Moscow", -10, 0], ["Nizhniy Novgorod", -15, -20]])
    assert.deepStrictEqual(feedData.recordSet.values, [
      {
        "city": "Moscow",
        "today_temp": -10,
        "tomorrow_temp": 0
      },
      {
        "city": "Nizhniy Novgorod",
        "today_temp": -15,
        "tomorrow_temp": -20
      }
    ]);
  }

  suite('load files from http', function () {
    let tester = new FeedServiceTester();

    suiteSetup(async function () {
      tester.start();
    });

    suiteTeardown(function () {
      tester.shutdown();
    });

    test('load a JSON file', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather.json'),
        type: FeedType.JSON,
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      //console.log(JSON.stringify(feedData));
      assertWeatherJson(feedData);
    });

    test('load a JSONL file', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather-jsonl.json'),
        type: FeedType.JSONL,
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      //console.log(JSON.stringify(feedData));
      assertWeatherJson(feedData);
    });

    test('load a JSON: archived as zip', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather.json.zip'),
        type: FeedType.JSON,
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      assertWeatherJson(feedData);
    });

    test('load a JSON: archived as gzip', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather.json.gz'),
        type: FeedType.JSON,
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      assertWeatherJson(feedData);
    });

    test('load a CSV file', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather.csv'),
        type: FeedType.CSV,
        key_column: 'city'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      //console.log(JSON.stringify(feedData));
      assertWeatherCsv(feedData);
    });

    test('load a CSV in non-UTF8 encoding', async function () {
      let feedService = new FeedService(winston);
      // weather_columns_1251 is a CSV file in Windows-1251 encoding
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather_columns_1251.csv'),
        type: FeedType.CSV,
        charset: 'windows-1251',
        key_column: 'Region'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      console.log(feedData.getRow(0)['Region']);
      assert.strictEqual(feedData.getRow(0)['Region'], 'Республика Хакасия');
    });

    test('load non existing file', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('non-existing.json'),
        type: FeedType.JSON,
        key_column: 'key'
      };
      try {
        await feedService.loadFeed(feedInfo);
        assert.fail('An exception is expected');
      } catch (e) {
        assert.ok(e.message);
      }
    });

    // TODO:
    test('load a file with macros in url');
  });

  suite('load file from GCS', function () {
    test('load a JSON from gs:// url', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'gs://triggerator-tests/weather.json',
        type: FeedType.JSON,
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      console.log("GOT FeedData");
      assertWeatherJson(feedData);
    });

    test('load a JSON in zip archive from gs:// url', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'gs://triggerator-tests/weather.json.zip',
        type: FeedType.JSON,
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      assertWeatherJson(feedData);
    });

    test('load a CSV from gs:// url', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'gs://triggerator-tests/weather.csv',
        type: FeedType.CSV,
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      console.log("GOT FeedData");
      assertWeatherCsv(feedData);
    });
  });

  suite('load file from Google Drive', function () {
    test('load a JSON from Drive', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'drive://1JWz87cdPk74tEYBPDQoG8-BVTFO_aQyk/weather.json',
        type: FeedType.JSON,
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      console.log("GOT FeedData");
      assertWeatherJson(feedData);
    });

    test('load a CSV in non-UTF8 encoding', async function () {
      let feedService = new FeedService(winston);
      // weather_columns_1251 is a CSV file in Windows-1251 encoding
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'drive://1JWz87cdPk74tEYBPDQoG8-BVTFO_aQyk/weather_columns_1251.csv',
        type: FeedType.CSV,
        charset: 'windows-1251',
        key_column: 'Region'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      console.log(feedData.getRow(0)['Region']);
      assert.strictEqual(feedData.getRow(0)['Region'], 'Республика Хакасия');
    });
  });

  suite('load data from Google Spreadsheet', function () {
    test('load Spreadsheet data by a full link', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'https://docs.google.com/spreadsheets/d/1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg/edit',
        type: FeedType.GoogleSpreadsheet,
        key_column: 'city_id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      /* The spreadsheet (shared globaly) is (Sheet "Data"):
      city_id	city_name	geo_code	budget
      452949	Udomlya	452949	0.4871864591
      521118	Nizhnekamsk	521118	0.565594712
      520494	Nizhniy Tagil	520494	0.7539554041
      524901	Moscow	524901	0.5362506897
      */
      // assert.deepStrictEqual(feedData.columns, ["city_id","city_name","geo_code","budget"]);
      // assert.deepStrictEqual(feedData.values, [
      //   [452949,"Udomlya",452949,0.4871864591],
      //   [521118,"Nizhnekamsk",521118,0.565594712],
      //   [520494,"Nizhniy Tagil",520494,0.7539554041]
      // ]);
      assert.deepStrictEqual(feedData.recordSet.values, [{
          city_id: 452949,
          city_name: "Udomlya",
          geo_code: 452949,
          budget: 0.4871864591
        }, {
          city_id: 521118,
          city_name: "Nizhnekamsk",
          geo_code: 521118,
          budget: 0.565594712
        }, {
          city_id: 520494,
          city_name: "Nizhniy Tagil",
          geo_code: 520494,
          budget: 0.7539554041
        }, {
          city_id: 524901,
          city_name: "Moscow",
          geo_code: 524901,
          budget: 0.5362506897
        }
      ]);
    });

    test('load Spreadsheet data by a full link with sheetid(gid)', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'https://docs.google.com/spreadsheets/d/1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg/edit#gid=411533494',
        type: FeedType.GoogleSpreadsheet,
        key_column: 'city_id'
      };
      let feedData = await feedService.loadSpreadsheet(feedInfo);
      /* The spreadsheet (shared globaly) is (Sheet "Data2"):
      city_id	city_name	geo_code	budget
      524901	Moscow	524901	0.5362506897
      522941	Neftekumsk	522941	0.3007998106
      523812	Mytishchi	523812	0.6217774466
      */
      // assert.deepStrictEqual(feedData.columns, ["city_id","city_name","geo_code","budget"]);
      // assert.deepStrictEqual(feedData.values, [
      //   [524901,"Moscow",524901,0.5362506897],
      //   [522941,"Neftekumsk",522941,0.3007998106],
      //   [523812,"Mytishchi",523812,0.6217774466]
      // ]);
      assert.deepStrictEqual(feedData.recordSet.values, [
        {
          city_id: 524901,
          city_name: "Moscow",
          geo_code: 524901,
          budget: 0.5362506897
        },
        {
          city_id: 522941,
          city_name: "Neftekumsk",
          geo_code: 522941,
          budget: 0.3007998106
        },
        {
          city_id: 523812,
          city_name: "Mytishchi",
          geo_code: 523812,
          budget: 0.6217774466
        }
      ]);
    });

    test('load Spreadsheet data by a spreadsheetId', async function () {
      let feedService = new FeedService(winston);
      let feedInfo: FeedInfo = {
        name: 'test',
        url: '1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg,Data2!A1:Z10',
        type: FeedType.GoogleSpreadsheet,
        key_column: 'city_id'
      };
      let feedData = await feedService.loadSpreadsheet(feedInfo);
      /* The spreadsheet (shared globaly) is (Sheet "Data2"):
      city_id	city_name	geo_code	budget
      524901	Moscow	524901	0.5362506897
      522941	Neftekumsk	522941	0.3007998106
      523812	Mytishchi	523812	0.6217774466
      */
      // assert.deepStrictEqual(feedData.columns, ["city_id","city_name","geo_code","budget"]);
      // assert.deepStrictEqual(feedData.values, [
      //   [524901,"Moscow",524901,0.5362506897],
      //   [522941,"Neftekumsk",522941,0.3007998106],
      //   [523812,"Mytishchi",523812,0.6217774466]
      // ]);
      assert.deepStrictEqual(feedData.recordSet.values, [
        {
          city_id: 524901,
          city_name: "Moscow",
          geo_code: 524901,
          budget: 0.5362506897
        },
        {
          city_id: 522941,
          city_name: "Neftekumsk",
          geo_code: 522941,
          budget: 0.3007998106
        },
        {
          city_id: 523812,
          city_name: "Mytishchi",
          geo_code: 523812,
          budget: 0.6217774466
        }
      ]);
    });
  });

  suite('joins', function () {
    test('joining two Sheets feeds', async function () {
      let feedService = new FeedService(winston);
      let feedConfig: FeedConfig = {
        feeds: [
          {
            name: 'sheet2',
            url: '1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg,Data2!A1:Z',
            type: FeedType.GoogleSpreadsheet,
            key_column: 'city_id'
            /* The spreadsheet (shared globaly) is (Sheet "Data2"):
            city_id	city_name	geo_code	budget
            524901	Moscow	524901	0.5362506897
            522941	Neftekumsk	522941	0.3007998106
            523812	Mytishchi	523812	0.6217774466
            */
          }, {
            name: 'sheet1',
            url: 'https://docs.google.com/spreadsheets/d/1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg/edit',
            type: FeedType.GoogleSpreadsheet,
            key_column: 'city_id',
            external_key: 'sheet2.city_id'
            /* The spreadsheet (shared globaly) is (Sheet "Data"):
            city_id	city_name	geo_code	budget
            452949	Udomlya	452949	0.4871864591
            521118	Nizhnekamsk	521118	0.565594712
            520494	Nizhniy Tagil	520494	0.7539554041
            524901	Moscow	524901	0.5362506897
            */
          }
        ],
        name_column: "city_name"
      }
      let feedData = await feedService.loadAll(feedConfig);
      assert.deepStrictEqual(feedData.recordSet.values, [
        {
          city_id: 524901,
          city_name: "Moscow",
          geo_code: 524901,
          budget: 0.5362506897,
          // NOTE: duplicating fields are prepended by feed name
          "sheet1.budget": 0.5362506897,
          "sheet1.city_id": 524901,
          "sheet1.city_name": "Moscow",
          "sheet1.geo_code": 524901,
          $sheet2: [524901, 'Moscow', 524901, 0.5362506897],
          $sheet1: [524901, 'Moscow', 524901, 0.5362506897]
        }
      ]);
    });

    test('Joining 3 feeds (1->2->3)', async function () {
      let feedService = new FeedService(winston);
      let feedConfig: FeedConfig = {
        feeds: [
          {
            name: 'main',
            url: '1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg,JoinTest1!A1:Z',
            type: FeedType.GoogleSpreadsheet,
            key_column: 'city_id'
            /* The spreadsheet (shared globaly) is (Sheet "JointTest1"):
            city_id	temp
            452949	-20
            521118	-30
            520494	-40
            524901	-10
            */
          }, {
            name: 'city',
            url: '1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg,JoinTest2!A1:Z5',
            type: FeedType.GoogleSpreadsheet,
            key_column: 'id',
            external_key: 'main.city_id'
            /* The spreadsheet (shared globaly) is (Sheet "JointTest2"):
            id	    city          country_id
            520494	Nizhniy Tagil 7
            524901	Moscow        7
            */
          }, {
            // NOTE that it's the very same sheet actually, but different rows
            name: 'country',
            url: '1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg,JoinTest2!A10:Z15',
            type: FeedType.GoogleSpreadsheet,
            key_column: 'id',
            external_key: 'city.country_id'
            /* The spreadsheet (shared globaly) is (Sheet "JointTest2"):
            id	country
            7	  Russia
            */
          }
        ],
        name_column: "city"
      }
      let feedData = await feedService.loadAll(feedConfig);
      assert.deepStrictEqual(feedData.recordSet.values, [
        {
          city_id: 520494,
          temp: -40,
          city: "Nizhniy Tagil",
          country_id: 7,
          country: 'Russia',
          // TODO: under consideration
          "country.id": 7,
          "id": 520494,
          $main: [520494, -40],
          $city: [520494, 'Nizhniy Tagil', 7],
          $country: [7, 'Russia']
        }, {
          city_id: 524901,
          temp: -10,
          //"city.id": 524901,
          city: "Moscow",
          country_id: 7,
          //"country.id": 7,
          country: 'Russia',
          // TODO: under consideration
          "country.id": 7,
          "id": 524901,
          $main: [524901, -10],
          $city: [524901, 'Moscow', 7],
          $country: [7, 'Russia']
        }
      ]);
    });
  });
});
