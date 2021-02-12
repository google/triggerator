import {sheets_v4, google} from 'googleapis';
import Config, { FeedInfo, RuleInfo } from './config';

/*
const SHEET_NAMES = {
  General: "General",
  Rules: "Rules",
  Feeds: "Feeds"
}
*/
export default class ConfigService {
  spreadsheetId: string;

  constructor(spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
  }

  private async loadGeneralSettings(sheetsAPI: sheets_v4.Sheets, config: Config) {
    const request = {
      spreadsheetId: this.spreadsheetId,
      range: 'General!A1:Z',
      majorDimension: 'ROWS'
    };    
    const valueRange = (await sheetsAPI.spreadsheets.values.get(request)).data;
    if (!valueRange.values || valueRange.values.length === 0) {
      throw new Error(`BAD_CONFIG_SPREADSHEET: Spreadsheet ${this.spreadsheetId} doesn't contain any values on 'General' sheet`);
    }
    for (const row of valueRange.values) {
      if (!row[0] || !row[1]) continue;
      const name = row[0].toString().toLowerCase().replace(":", "");
      const value = row[1].toString().toLowerCase().replace(":", "");
      switch(name) {
        case 'feed row label column':
          config.feedInfo.name_column = value;
          break;
        case 'geo code column':
          config.feedInfo.geo_code_column = value;
          break;
        case 'budget factor column':
          config.feedInfo.budget_factor_column = value;
          break;
        // DV360 Generation:
        case 'sdf version':
          config.dv360Template.sdf_version = value;
          break;
        case 'template campaign id':
          config.dv360Template.template_campaign = value;
          break;
        case 'new campaign name':
          config.dv360Template.campaign_name = value;
          break;
        case 'total budget':
          config.dv360Template.total_budget = value;
          break;
        case 'display insertion order name template':
          config.dv360Template.io_template = value;
          break;
        case 'display line item name template':
          config.dv360Template.li_template = value;
          break;
        case 'trueview insertion order name template':
          config.dv360Template.yt_io_template = value;
          break;
        case 'trueview line item name template':
          config.dv360Template.yt_li_template = value;
          break;
        case 'trueview ad group name template':
          config.dv360Template.adgroup_template = value;
          break;
        case 'trueview ad name template':
          config.dv360Template.adgroup_template = value;
          break;
        case 'destination folder':
          config.dv360Template.destination_folder = value;
          break;
        // Trigger Execution:
        case 'campaing id':
          config.execution.campaign_id = value;
          break;
        case 'run daily at (europe/moscow)':
          config.execution.run_at = value;
          break;
        case 'dv360 api version':
          config.execution.dv360ApiVersion = value;
          break;
        case 'reallocate budgets':
          config.execution.reallocateBudgets = value == 'TRUE'
          break;
        case 'adjust bids':
          config.execution.adjustBids = value == 'TRUE'
          break;
        case 'send notifications to':
          config.execution.notificationEmails = value;
          break;
        }
    }
    /* General tab:
      Feed row label column:: main.city.name
      GEO code column:: extra.geo_code
      Budget factor column:: extra.budget
      
      DV360 Generation: 
      SDF Version:: 4.1
      Template campaign ID:: 3799005
      New campaign name:: New campaign 22
      Total budget:: 1000000
      Display Insertion Order name template:: {base_name}-{row_name}
      Display Line Item name template:: {base_name}-{row_name}-{tier_name}
      TrueView Insertion Order name template:: {base_name}-{row_name}-{tier_name}
      TrueView Line Item name template:: {base_name}-{row_name}-{tier_name}
      TrueView Ad Group name template:: {base_name}-{row_name}-{tier_name}
      TrueView Ad name template:: {base_name}-{row_name}-{tier_name}
      Destination folder:: drive://14yfXjbrnVI11BnmvAzieOCnpsmSG0T5m
      
      Trigger Execution:
      Campaing ID:: undefined
      Run daily at (Europe/Moscow):: 09:00
      DV360 API version: 2.0 or 1.0
      API Key: AIzaSyC-1ekthho3fPFHilnStYl6ZfLr8tc84qg
      Reallocate Budgets: FALSE
      Adjust Bids: FALSE
      DV360 non-TrV Report ID: 649720425
      DV360 TrV Report ID: 649720509
      Run optimisation every: Friday
      Send notifications to: alipatov@google.com
      Process reports at (Europe/Moscow):: 06:00
      Download reports: FALSE

     */
  }
  
  private async loadStates(sheetsAPI: sheets_v4.Sheets, config: Config) {
    const request = {
      spreadsheetId: this.spreadsheetId,
      range: 'States!A2:Z', // skipping the first row with headers
      majorDimension: 'ROWS'
    };    
    const valueRange = (await sheetsAPI.spreadsheets.values.get(request)).data;
    if (!valueRange.values || valueRange.values.length === 0) {
      throw new Error(`BAD_CONFIG_SPREADSHEET: Spreadsheet ${this.spreadsheetId} doesn't contain any values on 'States' sheet`);
    }
    for (const row of valueRange.values) {
      let isYT = row[2].toLowerCase() === 'youtube';
      let state: RuleInfo = {
        // State | Condition | Media | Creatives | Bid | IO Frequency | LI Frequency
        name: row[0],
        condition: row[1],
      };
      if (isYT) {
        state.yt_creatives = row[3];
        state.yt_bid = row[4];
        state.yt_frequency_io = row[5];
        state.yt_frequency_li = row[6];
      } else {
        state.creatives = row[3];
        state.bid = row[4];
        state.frequency_io = row[5];
        state.frequency_li = row[6];
      }
      config.rules.push(state);
    }
  }

  private async loadFeeds(sheetsAPI: sheets_v4.Sheets, config: Config) {
    const request = {
      spreadsheetId: this.spreadsheetId,
      range: 'Feeds!A2:Z', // skipping the first row with headers
      majorDimension: 'ROWS'
    };    
    const valueRange = (await sheetsAPI.spreadsheets.values.get(request)).data;
    if (!valueRange.values || valueRange.values.length === 0) {
      throw new Error(`BAD_CONFIG_SPREADSHEET: Spreadsheet ${this.spreadsheetId} doesn't contain any values on 'States' sheet`);
    }
    for (const row of valueRange.values) {
      let type = row[2].toLowerCase();
      // TODO
      switch(type) {
        case 'external json':
          break;
        case 'external csv':
          break;
        case 'google drive csv':
          break;
        case 'google drive json':
          break;
        case 'google spreadsheet':
          break;
      }
      // Name	Type	URL	Charset	Unique Key	External Key
      let feed: FeedInfo = {
        name: row[0],
        type: row[1],
        url: row[2],
        charset: row[3],
        key_column: row[4],
        external_key: row[5]
      }
      config.feedInfo.feeds.push(feed)
    }
  }

  /**
   * Loads a configiguratin from Google Spreadsheet by its id.
   */
  async load(): Promise<Config> {    
    //const sheetsAPI = new sheets_v4.Sheets({auth: auth});
    const sheetsAPI = google.sheets({ version: "v4" });    
    /*
    TODO: we can fetch all sheets at once with spreadsheets.get API but 
        response type isn't so convinient as valiues.get.
    let spreadsheet = await sheetsAPI.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      includeGridData: true
    });
    let sheets = spreadsheet.data.sheets;
    // We expect to find the following sheets:
    //  General
    //  Rules (formerly "States")
    //  Feeds
    if (!spreadsheet.data.sheets || spreadsheet.data.sheets.length === 0) {
      throw new Error(`BAD_CONFIG_SPREADSHEET: Spreadsheet ${spreadsheet.data.properties?.title} doesn't contain expected sheets`);
    }
    for (const sheet of spreadsheet.data.sheets) {
      if (sheet.properties?.title === SHEET_NAMES.General) {
        sheet.data
      }
    }
    */
    let config = new Config();
    await this.loadGeneralSettings(sheetsAPI, config);
    await this.loadStates(sheetsAPI, config);
    await this.loadFeeds(sheetsAPI, config);

    return config;
  }
}