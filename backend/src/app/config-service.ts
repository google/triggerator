import { sheets_v4, google } from 'googleapis';
import { dataproc } from 'googleapis/build/src/apis/dataproc';
import _ from 'lodash';
import ConfigInfo, { FeedInfo, FeedType, RuleInfo, RuleState, Config, AppList, CustomFields, AppInfo, FeedConfig } from '../types/config';
import { RuleEvaluator } from './rule-engine';

export const CONFIG_SHEETS = {
  General: "General",
  States: "States",
  Feeds: "Feeds",
  CustomFields: "SDF Fields"
}
interface ValidationError {
  message: string;
}
function combineErrors(errorsSrc: ValidationError[], errorsAdd: ValidationError[]): ValidationError[] {
  if (!errorsSrc || !errorsSrc.length)
    return errorsAdd || [];
  if (!errorsAdd || !errorsAdd.length)
    return errorsSrc || [];
  if (!_.isArray(errorsSrc) || !_.isArray(errorsAdd)) 
    throw new Error(`ArgumentException: combineErrors expects arrays`);
  errorsSrc.push(...errorsAdd);
  return errorsSrc;
}

export default class ConfigService {
  sheetsAPI: sheets_v4.Sheets;

  constructor() {
    this.sheetsAPI = google.sheets({ version: "v4" });
  }

  private loadGeneralSettings(values: any[][], config: Config) {
    // const request = {
    //   spreadsheetId: spreadsheetId,
    //   range: CONFIG_SHEETS.General + '!A1:Z',
    //   majorDimension: 'ROWS'
    // };
    // const valueRange = (await this.sheetsAPI.spreadsheets.values.get(request)).data;
    // if (!valueRange.values || valueRange.values.length === 0) {
    //   throw new Error(`BAD_CONFIG_SPREADSHEET: Spreadsheet ${spreadsheetId} doesn't contain any values on 'General' sheet`);
    // }
    config.execution = config.execution || {};
    config.dv360Template = config.dv360Template || {};
    config.feedInfo = config.feedInfo || {};
    if (!values) return;
    for (const row of values) {
      if (!row[0] || !row[1]) continue;
      const name = row[0].toString().toLowerCase().replace(":", "");
      const value = row[1].toString();
      switch (name) {
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
        case 'advertiser id':
          config.execution.advertiserId = value;
        //case 'sdf version':
        //  config.dv360Template.sdf_version = value;
        //  break;
        case 'template campaign id':
          config.dv360Template.template_campaign = value;
          break;
        case 'new campaign name':
          config.dv360Template.campaign_name = value;
          break;
        case 'total budget':
          config.dv360Template.total_budget = Number(value);
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
          config.dv360Template.ad_template = value;
          break;
        case 'destination folder':
          config.dv360Template.destination_folder = value;
          break;
        // Trigger Execution:
        case 'campaing id':
          config.execution.campaignId = value;
          break;
        // case 'run daily at (europe/moscow)':
        //   config.execution.run_at = value;
        //   break;
        // case 'dv360 api version':
        //   config.execution.dv360ApiVersion = value;
        //   break;
        // case 'reallocate budgets':
        //   config.execution.reallocateBudgets = value == 'TRUE'
        //   break;
        // case 'adjust bids':
        //   config.execution.adjustBids = value == 'TRUE'
        //   break;
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

  private loadStates(values: any[][], config: Config) {
    // const request = {
    //   spreadsheetId: spreadsheetId,
    //   range: CONFIG_SHEETS.States + '!A2:Z', // skipping the first row with headers
    //   majorDimension: 'ROWS'
    // };
    // const valueRange = (await this.sheetsAPI.spreadsheets.values.get(request)).data;
    // if (!valueRange.values || valueRange.values.length === 0) {
    //   throw new Error(`BAD_CONFIG_SPREADSHEET: Spreadsheet ${spreadsheetId} doesn't contain any values on 'States' sheet`);
    // }
    if (!values) return;
    let rules_map: Record<string, RuleInfo> = {};
    let rules: RuleInfo[] = [];
    for (const row of values) {
      // row's columns: 
      // State (req) | Condition (req) | Media (req) | Creatives | Bid | IO Frequency | LI Frequency
      const name = row[0];
      if (!name) throw new Error(`[ConfigService] Rule's name is empty: ${row}`);
      let rule = rules_map[name];
      if (!rule) {
        rule = {
          name: name,
          condition: row[1],
        }
        rules_map[name] = rule;
        rules.push(rule);
      } else {
        rule.condition = rule.condition || row[1];
      }
      // TODO: стоит ли генерить исключение пори чтении? (нет)
      if (!row[2]) throw new Error(`[ConfigService] Rule's media is empty (should be either Display or YouTube): ${row}`);
      let isYT = row[2].toLowerCase() === 'youtube';
      let state = {
        creatives: row[3], // ? row[3].split(",") : undefined,
        bid: row[4],
        frequency_io: row[5],
        frequency_li: row[6]
      } as RuleState;
      if (isYT) {
        rule.youtube_state = state;
      } else {
        rule.display_state = state;
      }
    }
    // check that every rule has a condition
    for (const rule of rules) {
      if (!rule.condition) throw new Error(`[ConfigService] Rule ${rule.name} has no a condition specified`);
    }
    config.rules = rules;
  }

  private loadFeeds(values: any[][], config: Config) {
    // const request = {
    //   spreadsheetId: spreadsheetId,
    //   range: CONFIG_SHEETS.Feeds + '!A2:Z', // skipping the first row with headers
    //   majorDimension: 'ROWS'
    // };
    // const valueRange = (await this.sheetsAPI.spreadsheets.values.get(request)).data;
    // if (!valueRange.values || valueRange.values.length === 0) {
    //   throw new Error(`BAD_CONFIG_SPREADSHEET: Spreadsheet ${spreadsheetId} doesn't contain any values on 'States' sheet`);
    // }
    config.feedInfo = config.feedInfo || {};

    if (!values) return;
    let feeds: FeedInfo[] = [];
    for (const row of values) {
      let type = row[1].toLowerCase();
      // TODO
      switch (type) {
        case 'external json':
        case 'json':
        case 'google drive json':
          type = FeedType.JSON;
          break;
        case 'jsonl':
          type = FeedType.JSONL;
          break;
        case 'external csv':
        case 'csv':
        case 'google drive csv':
          type = FeedType.CSV;
          break;
        // case 'google drive csv':
        //   break;
        // case 'google drive json':
        //   break;
        case 'google spreadsheet':
          type = FeedType.GoogleSpreadsheet
          break;
        default:
          type = FeedType.Auto;
          break;
      }
      // Name	Type	URL	Charset	Unique Key	External Key
      let feed: FeedInfo = {
        name: row[0],
        type: type,
        url: row[2],
        charset: row[3],
        key_column: row[4],
        external_key: row[5]
      }
      feeds.push(feed)
    }
    config.feedInfo.feeds = feeds;
  }

  private loadCustomFields(values: any[][], config: Config) {
    if (!values) return;
    let fields: CustomFields[] = [];
    for (const row of values) {
      fields.push({
        element_state: row[0],
        media: row[1],
        sdf_type: row[2],
        sdf_field: row[3],
        feed_column: row[4]
      });
    }
    config.customFields = fields;
  }

  /**
   * Loads a configuration from Google Spreadsheet by its id.
   */
  async loadConfiguration(spreadsheetId: string): Promise<Config> {
    let config = new ConfigInfo();
    // load title (have to do it via separate call)
    try {
      let props = (await this.sheetsAPI.spreadsheets.get({
        spreadsheetId: spreadsheetId,
        fields: "properties"
      })).data.properties;
      config.title = props?.title || "";
    } catch(e) {
      console.error(`[ConfigService] Error on loading spreadsheet ${spreadsheetId}: `, e.message);
      throw e;
    }

    const request: sheets_v4.Params$Resource$Spreadsheets$Values$Batchget = {
      spreadsheetId: spreadsheetId,
      ranges: [
        CONFIG_SHEETS.General + '!A1:Z',
        CONFIG_SHEETS.States + '!A2:Z',
        CONFIG_SHEETS.Feeds + '!A2:Z',
        CONFIG_SHEETS.CustomFields + '!A2:Z'
      ],
      majorDimension: 'ROWS'
    };
    try {
      // TODO: we'll get BadRequest/400 error with message "Unable to parse range: General!A1:Z"
      // if any requested sheets don't exits!
      const valueRanges = (await this.sheetsAPI.spreadsheets.values.batchGet(request)).data.valueRanges!;
      for (const range of valueRanges) {
        let sheetName = range.range?.substring(0, range.range.indexOf('!'));
        switch (sheetName) {
          case CONFIG_SHEETS.General:
            this.loadGeneralSettings(range.values!, config);
            break;
          case CONFIG_SHEETS.States:
            this.loadStates(range.values!, config);
            break;
          case CONFIG_SHEETS.Feeds:
            this.loadFeeds(range.values!, config);
            break;
          case CONFIG_SHEETS.CustomFields:
            this.loadCustomFields(range.values!, config);
            break;
        }
      }
    } catch (e) {
      console.error(`[ConfigService] Error on fetching configuration from spreadsheet ${spreadsheetId}: `, e.message);
      throw e;
    }

    return config;
  }

  async validateMasterSpreadsheet(masterSpreadsheetId: string): Promise<string[]> {
    try {
      console.log(`[ConfigService] Fetching master spreadsheet ${masterSpreadsheetId}`);
      let values = (await this.sheetsAPI.spreadsheets.values.get({
        spreadsheetId: masterSpreadsheetId,
        majorDimension: 'ROWS',
        range: 'Main!A2:Z'
      })).data.values;
      if (values && values.length) {
        return values.map(row => row[0]);
      }
      return [];
    } catch (e) {
      if (e.response?.data?.error?.code === 400 && e.response.data.error.status === "INVALID_ARGUMENT") {
        console.log(`[ConfigService] Master spreadsheet ${masterSpreadsheetId} doesn't have Main sheet, creating one`);
        // it's an expected error that means there's no such Sheet 'Main' in the spreadsheet,
        // so create it
        /*
          "error": {
            "code": 400,
            "message": "Unable to parse range: Main1!A1",
            "status": "INVALID_ARGUMENT"
          }        
         */
        try {
          await this.sheetsAPI.spreadsheets.batchUpdate({
            spreadsheetId: masterSpreadsheetId,
            requestBody: {
              requests: [{
                addSheet: {
                  properties: {
                    title: 'Main'
                  }
                }
              }]
            }
          });
        } catch (e) {
          console.error(`[ConfigService] Failure on a sheet creation in master spreadsheet: `, e.message);
          throw e;
        }
        return [];
      }
      // any other error mean a real problem (permissions or non existing doc)
      console.error(`[ConfigService] Failed to fetch master spreadsheet ${masterSpreadsheetId}: `, e.message);
      throw e;
    }
    /* alternative way:
    let res = (await this.sheetsAPI.spreadsheets.get({
      spreadsheetId: masterSpreadsheetId,
      fields: "sheets.properties"
    })).data;
    let sheetsToCreate = [];
    if (!res.sheets) {
      sheetsToCreate = ['Main', 'Meta'];
    } else {
      if (!res.sheets.find(s => s.properties?.title === 'Main'))
        sheetsToCreate.push('Main');
      if (!res.sheets.find(s => s.properties?.title === 'Meta'))
        sheetsToCreate.push('Meta');
    }
    if (!sheetsToCreate.length) {
      // all good
      return;
    }
    let requests: sheets_v4.Schema$Request[] = [];
    for (const sheet of sheetsToCreate) {
      requests.push({
        addSheet: {
          properties: {
            title: sheet
          }
        }
      });
    }
    requests.push({
      createDeveloperMetadata: {
        //fields: "*",
        developerMetadata: {
          location: { spreadsheet: true },
          visibility: "DOCUMENT",
          metadataKey: "version",
          metadataValue: "1"
        }
      }
    });
    */

  }

  async loadApplicationList(masterSpreadsheetId: string): Promise<AppList> {
    let app_ids = await this.validateMasterSpreadsheet(masterSpreadsheetId);
    if (!app_ids || app_ids.length === 0) {
      return {
        spreadsheetId: masterSpreadsheetId,
        configurations: []
      };
    }
    let appList: AppList = {
      spreadsheetId: masterSpreadsheetId,
      configurations: []
    }
    for (const docid of app_ids) {
      try {
        let props = (await this.sheetsAPI.spreadsheets.get({
          spreadsheetId: docid,
          fields: "properties"
        })).data.properties;
        appList.configurations.push({
          name: props?.title || '',
          configId: docid,
          version: "1",
          status: "active"
        });
      } catch (e) {
        appList.configurations.push({
          name: '',
          configId: docid,
          version: "1",
          status: "invalid",
          statusDetails: e.message
        });
      }
    }
    return appList;
  }

  async createApplication(masterSpreadsheetId: string, userEmail: string|null|undefined, name: string, appId?: string): Promise<AppInfo> {
    let app_ids = await this.validateMasterSpreadsheet(masterSpreadsheetId);
    // if appId is specified we need just connect master Spreadsheet and the referenced doc,
    // otherwise we need to create a new spreadsheet
    let sheetsAPI = google.sheets({ version: "v4" });
    if (appId) {
      if (app_ids.includes(appId)) {
        throw new Error(`[ConfigService] Application with id ${appId} alreday exists`);
      }
    }
    if (!appId) {
      console.log(`[ConfigService] Creating a new spreadsheet for a new app '${name}'`);
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
            ],
            properties: {
              title: name
            }
          },
        })).data;
        appId = response.spreadsheetId!;
        if (userEmail) {
          console.log(`[ConfigService] Sharing created doc (${appId}) with user '${userEmail}'`);
          let driveAPI = google.drive({version:"v3"});
          try {
            (await driveAPI.permissions.create({
              fileId: appId,
              //transferOwnership: true, - Sorry, cannot transfer ownership to xxx@xxx.com. Ownership can only be transferred to another user in the same organization as the current owner.
              requestBody: {
                role: 'writer',
                type: 'user',
                emailAddress: userEmail
              }
            }));
          } catch(e) {
            console.error(`Failed to change permissions on doc ${appId} for user ${userEmail}: ${e.message}`);
            console.error(e);
            // throw e; or not to throw?
          }
        }
      } catch (e) {
        console.error(`[ConfigService] Couldn't create a new spreadsheet: `, e.message);
        throw e;
      }
    }
    // add the new appId into the master doc
    app_ids.push(appId);
    // write it back
    this.updateApplicationList(masterSpreadsheetId, app_ids);

    // assign meta information to the spreadsheet
    try {
      await this.sheetsAPI.spreadsheets.batchUpdate({
        spreadsheetId: appId,
        requestBody: {
          requests: [{
            createDeveloperMetadata: {
              developerMetadata: {
                location: { spreadsheet: true },
                visibility: "DOCUMENT",
                metadataKey: "version",
                metadataValue: "1"
              }
            }
          }, {
            createDeveloperMetadata: {
              developerMetadata: {
                location: { spreadsheet: true },
                visibility: "DOCUMENT",
                metadataKey: "createdBy",
                metadataValue: userEmail
              }
            }
          }]
        }
      });
    } catch (e) {
      console.error(`[ConfigService] Failure on creating developer metadata: `, e.message);
      throw e;
    }

    let result: AppInfo = {
      name: name,
      configId: appId,
      status: 'active',
      version: "1"
    };
    console.log(`[ConfigService] Application created: `, JSON.stringify(result));
    return result;
  }

  async deleteApplication(masterSpreadsheetId: string, appId: string) {
    console.log(`[ConfigService] Deleting an application ${appId}`);
    let app_ids = await this.validateMasterSpreadsheet(masterSpreadsheetId);
    if (!app_ids.includes(appId)) {
      throw new Error(`[ConfigService] Application with id ${appId} doesn't exist`);
    }
    app_ids.splice(app_ids.indexOf(appId), 1);
    this.updateApplicationList(masterSpreadsheetId, app_ids);
    let driveAPI = google.drive({version:"v3"});
    try {
      await driveAPI.files.delete({
        fileId: appId
      })
    } catch(e) {
      console.error(`[ConfigService] An error occured on deleting spreadsheet ${appId}: `, e.message);
      throw e;
    }
  }

  async updateApplicationList(masterSpreadsheetId: string, app_ids: string[]) {
    // NOTE: if we are deleting rows then we need to extend randge with empty values to actually overwrite cells
    let rows = app_ids.map(id => [id]);
    rows.push(
      [''],
      [''],
      [''],
      [''],
      [''],
    )
    console.log(`[ConfigService] Updating application list in master doc: ` + JSON.stringify(rows));
    try {
      let res = (await this.sheetsAPI.spreadsheets.values.update({
        spreadsheetId: masterSpreadsheetId,
        range: 'Main!A2',
        valueInputOption: "USER_ENTERED",
        requestBody: {
          majorDimension: 'ROWS',
          values: app_ids.map(id => [id])
        }
      })).data;
    } catch(e) {
      console.error(`[ConfigService] Couldn't update master spreadsheet with new application: `, e.message);
      throw e;
    }    
  }

  private validateConfigurationBase(config: Config): ValidationError[] {
    if (!config.execution)
      throw new Error(`[validateConfiguration] config.execution section is missing`);
    if (!config.dv360Template)
      throw new Error(`[validateConfiguration] Config object doesn't have dv360Template section`);
    if (!config.feedInfo)
      throw new Error(`[validateConfiguration] config.feedInfo section is missing`);
    if (!config.rules)
      throw new Error(`[validationConfiguraton] config.rules section is missing`);

    let errors: ValidationError[] = this.validateFeeds(config.feedInfo);
    if (!config.execution.advertiserId)
      errors.push({ message: 'Advertiser id is not specified' });
    combineErrors(errors,
      this.validateRules(config.rules));

    return errors;
  }

  validateFeeds(feedInfo: FeedConfig): ValidationError[] {
    let errors = [];
    if (!feedInfo.feeds) {
      errors.push({ message: 'Feeds are not specified' });
    } else {
      if (!feedInfo.name_column)
        errors.push({ message: 'Feed name column is not specified' });

      for (let feed of feedInfo.feeds) {
        if (!feed.name)
          errors.push({ message: 'A feed\'s name is not specified' });
        if (!feed.url)
          errors.push({ message: `${feed.name}' feed's url  is not specified` });
        // TODO: key_columns задана если больше 2
      }
      // TODO: у всех фидов кроме одного задан вншний ключ и всех задан ключ
      // TODO: внешние ключи ссылаются на ключи других фидов (и не ссылаются на себя)
      // TODO: ссылки ключами не образуют циклов (надо построить граф)
    }
    return errors;
  }
  validateRules(rules: RuleInfo[]): ValidationError[] {
    let errors: ValidationError[] = [];
    for (const rule of rules) {
      if (!rule.name)
        errors.push({ message: 'A rule\'s name is not specified' });
      if (!rule.condition)
        errors.push({ message: `${rule.name}' rule's condition is not specified` });
      if (!rule.display_state && !rule.youtube_state)
        errors.push({ message: `${rule.name}' rule's condition is not specified` });
    }
    return errors;
  }

  validateGeneratingConfiguration(config: Config, update: boolean): ValidationError[] {
    let errors = this.validateConfigurationBase(config);
    if (!config.dv360Template!.template_campaign)
      throw new Error(`[validateConfiguration] Template DV360 campaign id is missing in configuration`);
    if (update && !config.execution!.campaignId)
      throw new Error(`[validateConfiguration] Existing DV360 campaign id is missing in configuration`);

    return errors;
  }

  validateRuntimeConfiguration(config: Config): ValidationError[] {
    let errors = this.validateConfigurationBase(config);
    if (!config.execution!.campaignId)
      errors.push({ message: 'Campaign id is not specified' });

    return errors;
  }

  async updateConfiguration(spreadsheetId: string, config: Config) {
    throw new Error(`Not implemented`);
    // Update "Standard Columns" (General)
    // let res = (await this.sheetsAPI.spreadsheets.values.update({
    //   range: CONFIG_SHEETS.General + '!B2',
    //   spreadsheetId: spreadsheetId,
    //   valueInputOption: "USER_ENTERED",
    //   requestBody: {
    //     //range: CONFIG_SHEETS.General + '!A1:Z',
    //     majorDimension: 'ROWS',
    //     values: [
    //       [config.feedInfo.name_column],
    //       [config.feedInfo.geo_code_column],
    //       [config.feedInfo.budget_factor_column]
    //     ]
    //   },
    // })).data;
    // Update "DV360 Generation" (General)
    // Update "Trigger Execution" (General)

    // Update "States" (States)

    // Update "Feeds"

    // Update "SDF Fields"
  }

  async applyChanges(spreadsheetId: string, diff: Config): Promise<number> {
    console.log(`[ConfigService][applyChanges] Applying changes: ${JSON.stringify(diff)}`);
    let data: sheets_v4.Schema$ValueRange[] = [];
    if (diff.title) {
      try {
      await this.sheetsAPI.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId,
        requestBody: {
          includeSpreadsheetInResponse: false,
          responseIncludeGridData: false,
          requests: [{
            updateSpreadsheetProperties: {
              fields: "title",
              properties: {
                title: diff.title
              }
            }
          }]
        }
      });
      } catch(e) {
        console.error(`[ConfigService] Updating title (${diff.title}) in spreadsheet ${spreadsheetId} failed: `, e.message);
        throw e;
      }
    }
    if (diff.feedInfo) {
      if (diff.feedInfo.hasOwnProperty('name_column'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A2',
          values: [['feed row label column', diff.feedInfo.name_column]],
        });
      if (diff.feedInfo.hasOwnProperty('geo_code_column'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A3',
          values: [['geo code column', diff.feedInfo.geo_code_column]],
        });
      if (diff.feedInfo.hasOwnProperty('budget_factor_column'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A4',
          values: [['budget factor column', diff.feedInfo.budget_factor_column]],
        });
    }
    if (diff.execution) {
      if (diff.execution.hasOwnProperty('advertiserId'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A7',
          values: [['advertiser id', diff.execution.advertiserId]],
        });
      if (diff.execution.hasOwnProperty('campaignId'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A20',
          values: [['campaing id', diff.execution.campaignId]],
        });
      if (diff.execution.hasOwnProperty('notificationEmails'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A29',
          values: [['send notifications to', diff.execution.notificationEmails]],
        });
    }
    if (diff.dv360Template) {
      if (diff.dv360Template.hasOwnProperty('template_campaign'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A8',
          values: [['template campaign id', diff.dv360Template.template_campaign]],
        });
      if (diff.dv360Template.hasOwnProperty('campaign_name'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A9',
          values: [['new campaign name', diff.dv360Template.campaign_name]],
        });
      if (diff.dv360Template.hasOwnProperty('total_budget'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A10',
          values: [['total budget', diff.dv360Template.total_budget]],
        });
      if (diff.dv360Template.hasOwnProperty('io_template'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A11',
          values: [['display insertion order name template', diff.dv360Template.io_template]],
        });
      if (diff.dv360Template.hasOwnProperty('li_template'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A12',
          values: [['display line item name template', diff.dv360Template.li_template]],
        });
      if (diff.dv360Template.hasOwnProperty('yt_io_template'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A13',
          values: [['trueview insertion order name template', diff.dv360Template.yt_io_template]],
        });
      if (diff.dv360Template.hasOwnProperty('yt_li_template'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A14',
          values: [['trueview line item name template', diff.dv360Template.yt_li_template]],
        });
      if (diff.dv360Template.hasOwnProperty('adgroup_template'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A15',
          values: [['trueview ad group name template', diff.dv360Template.adgroup_template]],
        });
      if (diff.dv360Template.hasOwnProperty('ad_template'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A16',
          values: [['trueview ad name template', diff.dv360Template.ad_template]],
        });
      if (diff.dv360Template.hasOwnProperty('destination_folder'))
        data.push({
          majorDimension: 'ROWS',
          range: CONFIG_SHEETS.General + '!A17',
          values: [['destination folder', diff.dv360Template.destination_folder]],
        });
    }
    // feeds 
    if (diff.feedInfo && diff.feedInfo.feeds) {
      let values: any[][] = [];
      for (let feed of diff.feedInfo.feeds) {
        values.push([feed.name, feed.type, feed.url, feed.charset, feed.key_column, feed.external_key]);
      }
      for(let i=0;i<10;i++) {
        values.push(["","","","","","",""]);
      }
      data.push({
        majorDimension: 'ROWS',
        range: CONFIG_SHEETS.Feeds + '!A2',
        values: values,
      });
    }
    // rules
    if (diff.rules) {
      let values: any[][] = [];
      let ruleEvaluator = new RuleEvaluator();
      let errors = [];
      for (let rule of diff.rules) {
        let error = ruleEvaluator.validateRule(rule);
        if (error) {
          errors.push(`'${rule.name}' rule's condition is invalid: ${error}`);
        }
        values.push([rule.name, rule.condition, 'Display', rule.display_state?.creatives, rule.display_state?.bid, rule.display_state?.frequency_io, rule.display_state?.frequency_li]);
        values.push([rule.name, rule.condition, 'YouTube', rule.youtube_state?.creatives, rule.youtube_state?.bid, rule.youtube_state?.frequency_io, rule.youtube_state?.frequency_li]);
      }
      if (errors.length) {
        throw new Error(`Rules validation failed:\n` + errors.join(", "));
      }
      for(let i=0;i<10;i++) {
        values.push(["","","","","","",""]);
      }
      data.push({
        majorDimension: 'ROWS',
        range: CONFIG_SHEETS.States + '!A2',
        values: values,
      });
    }
    // customFields
    if (diff.customFields) {
      let values: any[][] = [];
      for (let field of diff.customFields) {
        values.push([field.element_state, field.media, field.sdf_type, field.sdf_field, field.feed_column]);
      }
      for(let i=0;i<10;i++) {
        values.push(["","","","","","",""]);
      }
      data.push({
        majorDimension: 'ROWS',
        range: CONFIG_SHEETS.CustomFields + '!A2',
        values: values,
      });
    }
    if (!data.length) {
      console.log(`[ConfigService][applyChanges] There is nothing to update`);
      return 0;
    }
    try {
      let res = (await this.sheetsAPI.spreadsheets.values.batchUpdate({
        spreadsheetId: spreadsheetId,
        requestBody: {
          data: data,
          valueInputOption: "USER_ENTERED",
        }
      })).data;
      console.log(`[ConfigService][applyChanges] Updated ${res.totalUpdatedCells} cells`);
      return <number>res.totalUpdatedCells;
    } catch(e) {
      console.error(`[ConfigService] Updating configuration ${spreadsheetId} failed: `, e.message);
      throw e;
    }
  }
}