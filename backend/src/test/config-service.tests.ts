import fs from 'fs';
import path from 'path';
import http from 'http';
import 'mocha';
import assert from 'assert';
import ConfigService, { CONFIG_SHEETS } from '../app/config-service';
import ConfigInfo, { FeedType, Config } from '../types/config';
import { sheets_v4, google } from 'googleapis';

const spreadsheetId = "1fOjOPQ9TKnoGGXPbG5d34YrkxivwePegLrVhtjbaoFA";
suite('ConfigService', () => {
  test('fetch and parse config from Spreadsheet', async function () {
    let svc = new ConfigService();
    let config = await svc.loadConfiguration(spreadsheetId);
    console.log(JSON.stringify(config, null, 2));
    let expected: Config = {
      execution: {
        advertiserId: "506732",
        campaignId: "3242703",
        //adjustBids: false,
        //reallocateBudgets: false,
        notificationEmails: "segy@google.com",
        //dv360ApiVersion: "",
        //run_at: ""
      },
      feedInfo: {
        name_column: "main.city.name", 
        geo_code_column: "extra.geo_code", 
        budget_factor_column: "extra.budget", 
        feeds: [{
          name: "main", 
          type: FeedType.JSONL, 
          url: "http://bulk.openweathermap.org/snapshot/aa5da7731af5e37b07dace380595f152/weather_14.json.gz", 
          charset: "",
          key_column: "city.id",
          external_key: undefined
        }, {
          name: "extra", 
          type: FeedType.GoogleSpreadsheet, 
          url: "https://docs.google.com/spreadsheets/d/1UPLlQu6CEkqSldvLcjPwIOuWJ2nvw4RyP4QZNWuES_w/edit#gid=1292883752", 
          charset: "",
          key_column: "city_id",
          external_key: "main.city.id"
        }]
      },
      customFields: [],
      dv360Template: {
        template_campaign: "3237246",
        campaign_name: "New campaign",
        total_budget: 1000000,
        io_template: "io-{base_name}-{row_name}",
        li_template: "li-{base_name}-{row_name}-{tier_name}",
        yt_io_template: "yt-io-{base_name}-{row_name}-{tier_name}",
        yt_li_template: "yt-li-{base_name}-{row_name}-{tier_name}",
        adgroup_template: "ag-{base_name}-{row_name}-{tier_name}",
        ad_template: "ad-{base_name}-{row_name}-{tier_name}",
        destination_folder: "gs://triggerator-tests/",
      },
      rules: [{
        name: "Below Zero",
        condition: "main.main.temp <= 273",
        display_state: {
          creatives: "195343801",
          bid: "1.1",
          frequency_io: "1/week",
          frequency_li: "1/day"
        },
        youtube_state: {
          creatives: "ggraAYSxy1M",
          bid: "1.2",
          frequency_io: "2/week",
          frequency_li: "2/day"
        }
      }, {
        name: "Above Zero",
        condition: "main.main.temp > 273",
        display_state: {
          creatives: "195343801",
          bid: "2.1",
          frequency_io: "3/week",
          frequency_li: "3/day"
        }, 
        youtube_state: {
          creatives: "ggraAYSxy1M",
          bid: "2.2",
          frequency_io: "4/week",
          frequency_li: "4/day"
        }
      }]
    };

    assert.strictEqual(config.execution!.advertiserId!, "506732");
    assert.deepStrictEqual((<ConfigInfo>config).toJSON(), expected);
  });

  test('create a new spreadsheet, save and load data', async function () {
    let sheetsAPI = google.sheets({ version: "v4" });
    try {
      const response = (await sheetsAPI.spreadsheets.create({
        requestBody: {
          sheets: [
            {
              properties: {
                title: CONFIG_SHEETS.General
              }
            }, {
              properties: {
                title: CONFIG_SHEETS.States
              }
            }, {
              properties: {
                title: CONFIG_SHEETS.Feeds
              }
            }, {
              properties: {
                title: CONFIG_SHEETS.CustomFields
              }
            }
          ]
        },
      })).data;
      let spreadsheetId = response.spreadsheetId!;
      console.log(spreadsheetId);
      console.log(JSON.stringify(response, null, 2));

      let config: Config = {
        execution: {
          advertiserId: "506732",
          campaignId: "3242703",
          //adjustBids: false,
          //reallocateBudgets: false,
          notificationEmails: "me@example.com",
        },
        feedInfo: {
          name_column: "main.city.name", 
          geo_code_column: "extra.geo_code", 
          budget_factor_column: "extra.budget", 
          feeds: [{
            name: "main", 
            type: FeedType.JSONL, 
            url: "http://bulk.openweathermap.org/snapshot/aa5da7731af5e37b07dace380595f152/weather_14.json.gz", 
            charset: "",
            key_column: "city.id",
            external_key: undefined
          }, {
            name: "extra", 
            type: FeedType.GoogleSpreadsheet, 
            url: "https://docs.google.com/spreadsheets/d/1UPLlQu6CEkqSldvLcjPwIOuWJ2nvw4RyP4QZNWuES_w/edit#gid=1292883752", 
            charset: "",
            key_column: "city_id",
            external_key: "main.city.id"
          }]
        },
        customFields: [],
        dv360Template: {
          template_campaign: "3237246",
          campaign_name: "New campaign",
          total_budget: 1000000,
          io_template: "io-{base_name}-{row_name}",
          li_template: "li-{base_name}-{row_name}-{tier_name}",
          yt_io_template: "yt-io-{base_name}-{row_name}-{tier_name}",
          yt_li_template: "yt-li-{base_name}-{row_name}-{tier_name}",
          adgroup_template: "ag-{base_name}-{row_name}-{tier_name}",
          ad_template: "ad-{base_name}-{row_name}-{tier_name}",
          destination_folder: "gs://triggerator-tests/",
        },
        rules: [{
          name: "Below Zero",
          condition: "main.main.temp <= 273",
          display_state: {
            creatives: "195343801",
            bid: "1.1",
            frequency_io: "1/week",
            frequency_li: "1/day"
          },
          youtube_state: {
            creatives: "ggraAYSxy1M",
            bid: "1.2",
            frequency_io: "2/week",
            frequency_li: "2/day"
          }
        }, {
          name: "Above Zero",
          condition: "main.main.temp > 273",
          display_state: {
            creatives: "195343801",
            bid: "2.1",
            frequency_io: "3/week",
            frequency_li: "3/day"
          }, 
          youtube_state: {
            creatives: "ggraAYSxy1M",
            bid: "2.2",
            frequency_io: "4/week",
            frequency_li: "4/day"
          }
        }]
      };

      let svc = new ConfigService();
      let rowcount = await svc.applyChanges(spreadsheetId, config);

      let loadedConfig = await svc.loadConfiguration(spreadsheetId);
      assert.deepStrictEqual(loadedConfig, config);
      
    } catch (err) {
      console.error(err);
    }
  });
});