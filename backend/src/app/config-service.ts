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
import { sheets_v4, google } from 'googleapis';
import { MAILER_CONFIG, SERVICE_ACCOUNT } from '../env';
import { FeedInfo, FeedType, RuleInfo, RuleState, Config, AppList, CustomFields, AppInfo, FeedConfig, SdfElementType, JobInfo } from '../types/config';
import { FeedData } from '../types/types';
import { RuleEvaluator } from './rule-engine';
import { Logger } from '../types/logger';
import SchedulerService from './cloud-scheduler-service';
import { shareFile } from './google-drive-facade';

export const CONFIG_SHEETS = {
  General: "General",
  States: "States",
  Feeds: "Feeds",
  CustomFields: "SDF Fields"
}
type AppData = {
  /** Spreadsheet id with configuration */
  id: string;
  /** Status of last run (error/sucess) */
  status: string | undefined;
  /** Timestamp of last run */
  timestampt: string | undefined;
}
type AppListData = AppData[];

export default class ConfigService {
  sheetsAPI: sheets_v4.Sheets;

  constructor(public logger: Logger) {
    if (!logger) throw new Error('[ConfigService] Required argument logger is missing');
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
    config.execution.notificationsEnabled = !!MAILER_CONFIG;
  }

  private loadRules(values: any[][], config: Config) {
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
      // TODO: стоит ли генерить исключение при чтении? (нет)
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
    config.feedInfo = config.feedInfo || {};
    config.feedInfo.feeds = config.feedInfo.feeds || [];

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
        case 'google cloud bigquery':
          type = FeedType.GoogleCloudBigQuery
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
      let sdf_type: SdfElementType | undefined = undefined;
      switch (row[2]) {
        // support values from v1
        case "Campaigns": sdf_type = SdfElementType.Campaign; break;
        case "Insertion Orders": sdf_type = SdfElementType.IO; break;
        case "Line Items": sdf_type = SdfElementType.LI; break;
        case "Ad Groups": sdf_type = SdfElementType.AdGroup; break;
        case "Ads": sdf_type = SdfElementType.Ad; break;
        default:
          // or just value as is
          sdf_type = row[2];
      }
      fields.push({
        rule_name: row[0],
        media: row[1],
        sdf_type: sdf_type,
        sdf_field: row[3],
        value: row[4]
      });
    }
    config.customFields = fields;
  }

  /**
   * Loads a configuration from Google Spreadsheet by its id.
   */
  async loadConfiguration(spreadsheetId: string): Promise<Config> {
    let config: Config = {};// = new ConfigInfo();
    if (!spreadsheetId) throw new Error(`[ConfigService] spreadsheetId was not specified`);
    // load title (have to do it via separate call)
    config.id = spreadsheetId;
    try {
      let props = (await this.sheetsAPI.spreadsheets.get({
        spreadsheetId: spreadsheetId,
        fields: "properties"
      })).data.properties;
      config.title = props?.title || "";
    } catch (e: any) {
      this.logger.error(`[ConfigService] Error on loading spreadsheet ${spreadsheetId}: ${e.message}`, e);
      e.logged = true;
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
        switch (sheetName?.replace(/["']/g, "")) {
          case CONFIG_SHEETS.General:
            this.loadGeneralSettings(range.values!, config);
            break;
          case CONFIG_SHEETS.States:
            this.loadRules(range.values!, config);
            break;
          case CONFIG_SHEETS.Feeds:
            this.loadFeeds(range.values!, config);
            break;
          case CONFIG_SHEETS.CustomFields:
            this.loadCustomFields(range.values!, config);
            break;
        }
      }
    } catch (e: any) {
      this.logger.error(`[ConfigService] Error on fetching configuration from spreadsheet ${spreadsheetId}: ${e.message}`, e);
      e.logged = true;
      throw e;
    }

    return config;
  }

  private async validateMasterSpreadsheet(masterSpreadsheetId: string): Promise<AppListData> {
    try {
      this.logger.info(`[ConfigService] Fetching master spreadsheet ${masterSpreadsheetId}`);
      let values = (await this.sheetsAPI.spreadsheets.values.get({
        spreadsheetId: masterSpreadsheetId,
        majorDimension: 'ROWS',
        range: 'Main!A2:Z'
      })).data.values;
      if (values && values.length) {
        return values.map(row => { return { id: row[0], status: row[1], timestampt: row[2] } })
          .filter(app => !!app.id);
      }
      return [];
    } catch (e: any) {
      if (e.response?.data?.error?.code === 400 && e.response.data.error.status === "INVALID_ARGUMENT") {
        this.logger.warn(`[ConfigService] Master spreadsheet ${masterSpreadsheetId} doesn't have Main sheet, creating one`);
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
        } catch (e: any) {
          this.logger.error(`[ConfigService] Failure on a sheet creation in master spreadsheet: ${e.message}`, e);
          throw e;
        }
        return [];
      }
      // any other error means a real problem (permissions or non existing doc)
      this.logger.error(`[ConfigService] Failed to fetch master spreadsheet ${masterSpreadsheetId}: ${e.message}`, e);
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

  async loadApplicationList(masterSpreadsheetId: string, includeJobs: boolean = true): Promise<AppList> {
    let app_ids = await this.validateMasterSpreadsheet(masterSpreadsheetId);
    if (!app_ids || app_ids.length === 0) {
      return {
        spreadsheetId: masterSpreadsheetId,
        configurations: []
      };
    }
    // start async fetching of Scheduler jobs
    let jobListTask: Promise<JobInfo[]>;
    if (includeJobs) {
      let scheduler = new SchedulerService(this.logger);
      jobListTask = scheduler.getJobList();
    }

    let appList: AppList = {
      spreadsheetId: masterSpreadsheetId,
      configurations: []
    }
    for (const appdata of app_ids) {
      try {
        let propsTask = this.sheetsAPI.spreadsheets.get({
          spreadsheetId: appdata.id,
          fields: "properties"
        });
        let driveAPI = google.drive({ version: "v3" });
        let fileInfoTask = driveAPI.files.get({
          fileId: appdata.id,
          fields: "modifiedTime,lastModifyingUser"
        });
        let props = (await propsTask).data.properties;
        let fileProps = (await fileInfoTask).data;
        appList.configurations.push({
          name: props?.title || '',
          configId: appdata.id,
          version: "1",
          status: appdata.status ? 'last run ' + (appdata.status === 'error' ? 'failed' : 'succeeded') : 'never ran',
          statusDetails: appdata.timestampt,
          lastModified: fileProps.modifiedTime ?? undefined,
          lastModifiedBy: fileProps.lastModifyingUser?.emailAddress ?? undefined
          // ? `<a href='https://console.cloud.google.com/logs/query;query=;timeRange=PT1H;cursorTimestamp=${appdata.timestampt}?project='><${appdata.timestampt}/a>` : ''
        });
      } catch (e: any) {
        this.logger.warn(`[ConfigService] Failed to fetch doc ${appdata.id}: ${e.message}`, e);
        appList.configurations.push({
          name: '',
          configId: appdata.id,
          version: "1",
          status: "invalid",
          statusDetails: e.message
        });
      }
    }

    // fetch all jobs and enrich the app list with their corresponding job infos
    if (includeJobs) {
      let jobList = await jobListTask!;
      for (const job of jobList) {
        if (!job.name) continue;
        let jobId = job.name.substring(job.name.indexOf('/jobs/') + '/jobs/'.length);
        let app = appList.configurations.find(app => app.configId === jobId);
        if (app && app.status !== 'invalid') {
          app.job = job;
        }
      }
    }

    return appList;
  }

  async createApplication(masterSpreadsheetId: string, userEmail: string | null | undefined, name: string, appId?: string): Promise<AppInfo> {
    let app_ids = await this.validateMasterSpreadsheet(masterSpreadsheetId);
    // if appId is specified we need just connect master Spreadsheet and the referenced doc,
    // otherwise we need to create a new spreadsheet
    if (appId) {
      if (app_ids.find(app => app.id === appId)) {
        throw new Error(`[ConfigService] Application with id ${appId} already exists`);
      }
    }
    let sheetsAPI = google.sheets({ version: "v4" });
    let attachingExisting = !!appId;
    if (!appId) {
      this.logger.info(`[ConfigService] Creating a new spreadsheet for a new app '${name}'`);
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
          this.logger.info(`[ConfigService] Sharing the created doc (${appId}) with user '${userEmail}'`);
          try {
            await shareFile(appId, userEmail);
          } catch (e: any) {
            this.logger.error(`Failed to change permissions on doc ${appId} for user ${userEmail}: ${e.message}`, e);
            // throw e; or not to throw?
          }
        }
      } catch (e: any) {
        this.logger.error(`[ConfigService] Couldn't create a new spreadsheet: ${e.message}`, e);
        throw e;
      }
    }
    // add the new appId into the master doc
    app_ids.push({id: appId, status: undefined, timestampt: undefined});
    // write it back
    this.updateApplicationList(masterSpreadsheetId, app_ids.map(app => app.id));

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
    } catch (e: any) {
      this.logger.error(`[ConfigService] Failure on creating developer metadata: ${e.message}`, e);
      if (attachingExisting && e.response?.data?.error?.code === 403) {
        throw new Error(`Cannot update Spreadsheet ${appId}, did you share it with '${SERVICE_ACCOUNT}' user?`);
      }
      throw e;
    }
    // put default values into the newly created configuration
    let config: Config = {
      dv360Template: {
        io_template: "{base_name}",
        li_template: "{base_name}-{row_name}-{rule_name}",
        yt_li_template: "{base_name}-{row_name}-{rule_name}",
        yt_io_template: "{base_name}",
        adgroup_template: "{base_name}",
        ad_template: "{base_name}"
      }
    };
    await this.applyChanges(appId, config);

    let result: AppInfo = {
      name: name,
      configId: appId,
      status: 'never ran',
      version: "1"
    };
    this.logger.info(`[ConfigService] Application created: `, JSON.stringify(result), { result: result });
    return result;
  }

  async cloneApplication(masterSpreadsheetId: string, userEmail: string | null | undefined, appId: string) {
    this.logger.info(`[ConfigService] Cloning an application ${appId}`);
    let app_ids = await this.validateMasterSpreadsheet(masterSpreadsheetId);
    if (!app_ids.find(app => app.id === appId)) {
      throw new Error(`[ConfigService] Application with id ${appId} doesn't exist`);
    }
    //let sheetsAPI = google.sheets({ version: "v4" });
    let driveAPI = google.drive({ version: "v3" });
    let newTitle = '';
    try {
      let res = (await driveAPI.files.copy({
        fileId: appId
      })).data;
      appId = res.id!;
      newTitle = res.name!;
    } catch (e: any) {
      this.logger.error(`[ConfigService] Couldn't copy a spreadsheet: ${e.message}`, e);
      throw e;
    }

    if (userEmail) {
      try {
        await shareFile(appId, userEmail);
      } catch (e: any) {
        this.logger.error(`Failed to change permissions on doc ${appId} for user ${userEmail}: ${e.message}`, e);
        // throw e; or not to throw?
      }
    }
    // add the new appId into the master doc
    app_ids.push({ id: appId, status: undefined, timestampt: undefined });
    // write it back
    this.updateApplicationList(masterSpreadsheetId, app_ids.map(app => app.id));

    let result: AppInfo = {
      name: newTitle,
      configId: appId,
      status: 'never ran',
      version: "1"
    };
    this.logger.info(`[ConfigService] Application cloned: `, JSON.stringify(result), { result: result });
    return result;
  }

  async deleteApplication(masterSpreadsheetId: string, appId: string) {
    this.logger.info(`[ConfigService] Deleting an application ${appId}`);
    let app_ids = await this.validateMasterSpreadsheet(masterSpreadsheetId);
    if (!app_ids.find(app => app.id === appId)) {
      throw new Error(`[ConfigService] Application with id ${appId} doesn't exist`);
    }
    app_ids.splice(app_ids.findIndex(app => app.id === appId), 1);
    await this.updateApplicationList(masterSpreadsheetId, app_ids.map(app => app.id));
    let driveAPI = google.drive({ version: "v3" });
    try {
      await driveAPI.files.delete({
        fileId: appId
      });
    } catch (e: any) {
      this.logger.error(`[ConfigService] An error occured on deleting spreadsheet ${appId}: ${e.message}`, e);
      e.logged = true;
      throw e;
    }
  }

  async trackExecution(masterSpreadsheetId: string, appId: string, status: string) {
    let apps = await this.loadApplicationList(masterSpreadsheetId, false);
    let idx = apps.configurations.findIndex((val) => {
      return val.configId === appId
    });
    if (idx >= 0) {
      try {
        let values = [[status, new Date().toISOString()]];
        let row_idx = 2 + idx; // values starts from the 2nd rows, and format one-based (A1 - top left cell)
        let res = (await this.sheetsAPI.spreadsheets.values.update({
          spreadsheetId: masterSpreadsheetId,
          range: 'Main!B' + row_idx,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            majorDimension: 'ROWS',
            values: values
          }
        })).data;
      } catch (e: any) {
        this.logger.error(`[ConfigService] Couldn't update master spreadsheet with last execution status : ${e.message}`, e);
        throw e;
      }
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
    this.logger.info(`[ConfigService] Updating application list in master doc: ` + JSON.stringify(rows));
    try {
      let res = (await this.sheetsAPI.spreadsheets.values.update({
        spreadsheetId: masterSpreadsheetId,
        range: 'Main!A2',
        valueInputOption: "USER_ENTERED",
        requestBody: {
          majorDimension: 'ROWS',
          values: rows
        }
      })).data;
    } catch (e: any) {
      this.logger.error(`[ConfigService] Couldn't update master spreadsheet with new application: ${e.message}`, e);
      throw e;
    }
  }

  async updateConfiguration(spreadsheetId: string, config: Config) {
    return this.applyChanges(spreadsheetId, config);
  }

  async applyChanges(spreadsheetId: string, diff: Config): Promise<number> {
    this.logger.info(`[ConfigService][applyChanges] Applying changes: ${JSON.stringify(diff)}`);
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
      } catch (e: any) {
        this.logger.error(`[ConfigService] Updating title (${diff.title}) in spreadsheet ${spreadsheetId} failed: ${e.message}`, e);
        e.logged = true;
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
      for (let i = 0; i < 10; i++) {
        values.push(["", "", "", "", "", "", ""]);
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
      for (let i = 0; i < 10; i++) {
        values.push(["", "", "", "", "", "", ""]);
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
        values.push([field.rule_name, field.media, field.sdf_type, field.sdf_field, field.value]);
      }
      for (let i = 0; i < 10; i++) {
        values.push(["", "", "", "", "", "", ""]);
      }
      data.push({
        majorDimension: 'ROWS',
        range: CONFIG_SHEETS.CustomFields + '!A2',
        values: values,
      });
    }
    if (!data.length) {
      this.logger.info(`[ConfigService][applyChanges] There is nothing to update`);
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
      this.logger.info(`[ConfigService][applyChanges] Updated ${res.totalUpdatedCells} cells`);
      return <number>res.totalUpdatedCells;
    } catch (e: any) {
      this.logger.error(`[ConfigService] Updating configuration ${spreadsheetId} failed: ${e.message}`, e);
      e.logged = true;
      throw e;
    }
  }
}