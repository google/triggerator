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
export type DV360TemplateInfo = {
  template_campaign?: string;
  campaign_name?: string;
  total_budget?: number;
  io_template?: string;
  li_template?: string;
  yt_io_template?: string;
  yt_li_template?: string;
  adgroup_template?: string;
  ad_template?: string;
  //sdf_version?: string;
  destination_folder?: string;
}
export enum FrequencyPeriod {
  "week" = "week",
  "day" = "day",
  "month" = "month"
}
//export type FrequencyPeriod = "week" | "day" | "month";
export type RuleState = {
  creatives?: string;
  bid?: string|number;
  /** Frequency in format X/[week|day|month], X is a number, e.g. 1/week, 3/day, 2/month */
  frequency_io?: string;
  frequency_li?: string;
}
export type RuleInfo = {
  name: string;
  condition: string;
  display_state?: RuleState;
  youtube_state?: RuleState;
  /*
  creatives?: string[];
  yt_creatives?: string[];
  bid?: number;
  yt_bid?: number;
  frequency_io?: Frequency;
  frequency_li?: Frequency;
  yt_frequency_io?: Frequency;
  yt_frequency_li?: Frequency;
  */
}
export enum FeedType {
  "Auto" = "Auto",
  "JSON" = "JSON",
  "JSONL" = "JSONL",
  "CSV" = "CSV",
  "GoogleSpreadsheet" = "Google Spreadsheet",
}
export type FeedInfo = {
  name: string,
  url: string,
  type: FeedType,
  key_column?: string,
  external_key?: string,
  charset?: string,
  username?: string,
  password?: string,
}
export type FeedConfig = {
  name_column?: string;
  //score_column: string;
  /**
   * Select a column in feed that will be used as 'Geography Targeting - Include' field of a Line Item.
   */
  geo_code_column?: string;
  budget_factor_column?: string;
  feeds?: FeedInfo[];
}
export type ExecutionConfig = {
  advertiserId?: string,
  /**
   * DV360 campaign id that is being managed by the tool (by one configuration).
   */
  campaignId?: string;
  notificationEmails?: string;
  run_at?: string; //'00:00',
  //dv360ApiVersion?: string; //'2.0 or 1.0'
  //reallocateBudgets?: boolean;
  //adjustBids?: boolean;
  //v2ApiKey: '',
  //dv360NonTrVReportId: '',
  //dv360TrVReportId: '',
  //optimisationDay: 'Friday',
  //process_reports_at: '00:00',
  //downloadReports: true
}
export enum SdfElementType {
  Campaign = "Campaigns",
  IO = "Insertion Orders",
  LI = "Line Items",
  AdGroup = "Ad Groups",
  Ad = "Ads"
}
export type CustomFields = {
  element_state: string,
  media: ''|'Display'|'YouTube',
  sdf_type: SdfElementType|undefined,
  sdf_field: string,
  feed_column: string
}
export interface Config {
  execution?: ExecutionConfig
  dv360Template?: DV360TemplateInfo
  rules?: RuleInfo[]
  feedInfo?: FeedConfig
  customFields?: CustomFields[];
  title?: string;
}

export default class ConfigInfo implements Config {
  rules?: RuleInfo[];
  feedInfo: FeedConfig;
  dv360Template?: DV360TemplateInfo;
  execution: ExecutionConfig;
  customFields?: CustomFields[];
  title?: string;

  constructor() {
    this.rules = [];
    this.feedInfo = {
      name_column: '',
      //score_column: '',
      geo_code_column: '',
      budget_factor_column: '',
      feeds: []
    };
    this.dv360Template = {
      template_campaign: '',
      campaign_name: '',
      total_budget: -1,
      io_template: '',
      li_template: '',
      yt_io_template: '',
      yt_li_template: '',
      adgroup_template: '',
      ad_template: '',
      //sdf_version: '',
      destination_folder: ''
    };
    this.execution = {
      //run_at: '00:00',
      advertiserId: '',
      campaignId: '',
      //dv360ApiVersion: '1.0', //'2.0 or 1.0'
      //reallocateBudgets: true,
      //adjustBids: true,
      notificationEmails: '',
    } as ExecutionConfig;
    this.customFields = [];
  }

  toJSON(): Config {
    return {
      title: this.title,
      execution: this.execution,
      rules: this.rules,
      feedInfo: this.feedInfo,
      dv360Template: this.dv360Template,
      customFields: this.customFields
    }
  }
}

export type AppStatus = "active" | "invalid"
export interface AppInfo {
  name?: string, 
  configId: string, 
  version: string, 
  status: AppStatus, 
  statusDetails?: string
}
export interface AppList {
  spreadsheetId: string;
  configurations: Array<AppInfo>;
}

export interface JobInfo {
  enable?: boolean;
  schedule?: string;
  timeZone?: string;
}