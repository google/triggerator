import fs from 'fs';
import path from 'path';
import http from 'http';
import 'mocha';
import assert from 'assert';
import FeedService from '../app/feed-service';
import { FeedInfo } from '../app/config';
import FeedData from '../app/feeddata';

class FeedServiceTester {
  server: http.Server;
  port = 9000;

  constructor() {
    let basepath = path.resolve(__dirname);
    this.server = http.createServer(function (req, res) {

      fs.readFile(basepath + req.url, function (err,data) {
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
    assert.strictEqual(feedData.columns.length, 25, 'column create for each primitive value in nested json');
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
    assert.deepStrictEqual(feedData.columns, [
      "city.id","city.name","city.findname","city.country","city.coord.lon","city.coord.lat","city.zoom",
      "time","sunrise","sunset","main.temp","main.feels_like","main.pressure","main.humidity","main.temp_min","main.temp_max",
      "visibility","wind.speed","wind.deg",
      "clouds.all","weather.0.id","weather.0.main","weather.0.description","weather.0.icon","uvi"
      ]);
    assert.deepStrictEqual(feedData.values[0], [
      524901,"Moscow","MOSCOW","RU",37.615555,55.75222,1,
      1611331348,1611294012,1611322902,271.18,266.12,1008,100,270.93,271.48,
      2900,4,190,90,701,"Mist","mist","50n",0.42
    ]);
  }

  suite('load files from http', async function() {
    let tester = new FeedServiceTester();

    suiteSetup(async function() {
      tester.start();
    });
  
    suiteTeardown(function() {
      tester.shutdown();
    });
  
    test('load a JSON: should return flattened FeedData from nested JSON', async function () {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather.json'),
        type: 'JSON',
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      //console.log(JSON.stringify(feedData));
      assertWeatherJson(feedData);
    });

    test('load a JSON: archived as zip', async function() {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather.json.zip'),
        type: 'JSON',
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      assertWeatherJson(feedData);
    });

    test('load a JSON: archived as gzip', async function() {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather.json.gz'),
        type: 'JSON',
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      assertWeatherJson(feedData);
    });

    test('load CSV: should return FeedData', async function () {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('weather.csv'),
        type: 'CSV',
        key_column: 'city'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      //console.log(JSON.stringify(feedData));
      /* weather.csv is:
      "city","today_temp","tomorrow_temp"
      "Moscow",-10,0
      "Nizhniy Novgorod",-15,-20
       */
      assert.deepStrictEqual(feedData.columns, ["city","today_temp","tomorrow_temp"]);
      assert.deepStrictEqual(feedData.values, [["Moscow",-10,0], ["Nizhniy Novgorod",-15,-20]])
    });

    test('load non existing file', async function() {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: tester.getHttpUrl('non-existing.json'),
        type: 'JSON',
        key_column: 'key'
      };
      try {
        await feedService.loadFeed(feedInfo);
        assert.fail('An exception is expected');
      } catch(e) {
        assert.ok(e.message);
      }
    });

    test('load a file with macros in url');
  });

  suite('load file from GCS', async function() {
    test('load a JSON from gs:// url', async function() {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'gs://triggerator-tests/weather.json',
        type: 'JSON',
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      assertWeatherJson(feedData);
    });

    test('load a JSON in zip archive from gs:// url', async function() {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'gs://triggerator-tests/weather.json.zip',
        type: 'JSON',
        key_column: 'city.id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      assertWeatherJson(feedData);
    });
  });
  
  suite('load data from Google Spreadsheet', async function() {
    test('load Spreadsheet data by a full link', async function() {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'https://docs.google.com/spreadsheets/d/1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg/edit',
        type: 'Google Spreadsheet',
        key_column: 'city_id'
      };
      let feedData = await feedService.loadFeed(feedInfo);
      /* The spreadsheet (shared globaly) is (Sheet "Data"):
      city_id	city_name	geo_code	budget
      452949	Udomlya	452949	0.4871864591
      521118	Nizhnekamsk	521118	0.565594712
      520494	Nizhniy Tagil	520494	0.7539554041
      */
      assert.deepStrictEqual(feedData.columns, ["city_id","city_name","geo_code","budget"]);
      assert.deepStrictEqual(feedData.values, [
        [452949,"Udomlya",452949,0.4871864591],
        [521118,"Nizhnekamsk",521118,0.565594712],
        [520494,"Nizhniy Tagil",520494,0.7539554041]
      ]);
    });

    test('load Spreadsheet data by a full link with sheetid(gid)', async function() {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: 'https://docs.google.com/spreadsheets/d/1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg/edit#gid=411533494',
        type: 'Google Spreadsheet',
        key_column: 'city_id'
      };
      let feedData = await feedService.loadSpreadsheet(feedInfo);
      /* The spreadsheet (shared globaly) is (Sheet "Data2"):
      city_id	city_name	geo_code	budget
      524901	Moscow	524901	0.5362506897
      522941	Neftekumsk	522941	0.3007998106
      523812	Mytishchi	523812	0.6217774466
      */
      assert.deepStrictEqual(feedData.columns, ["city_id","city_name","geo_code","budget"]);
      assert.deepStrictEqual(feedData.values, [
        [524901,"Moscow",524901,0.5362506897],
        [522941,"Neftekumsk",522941,0.3007998106],
        [523812,"Mytishchi",523812,0.6217774466]
      ]);
    });

    test('load Spreadsheet data by a spreadsheetId', async function() {
      let feedService = new FeedService();
      let feedInfo: FeedInfo = {
        name: 'test',
        url: '1KH8OlT9OqLWdktZ6zPSNs9caMq53zcDvs4aFWavkgtg,Data2!A1:Z',
        type: 'Google Spreadsheet',
        key_column: 'city_id'
      };
      let feedData = await feedService.loadSpreadsheet(feedInfo);
      /* The spreadsheet (shared globaly) is (Sheet "Data2"):
      city_id	city_name	geo_code	budget
      524901	Moscow	524901	0.5362506897
      522941	Neftekumsk	522941	0.3007998106
      523812	Mytishchi	523812	0.6217774466
      */
      assert.deepStrictEqual(feedData.columns, ["city_id","city_name","geo_code","budget"]);
      assert.deepStrictEqual(feedData.values, [
        [524901,"Moscow",524901,0.5362506897],
        [522941,"Neftekumsk",522941,0.3007998106],
        [523812,"Mytishchi",523812,0.6217774466]
      ]);
    });

  });
});
