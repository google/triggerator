export type DV360Template = {
  template_campaign: string;
  campaign_name: string;
  total_budget: string;
  io_template: string;
  li_template: string;
  yt_io_template: string;
  yt_li_template: string;
  adgroup_template: string;
  ad_template: string;
  sdf_version: string;
  destination_folder: string;
}
export type Frequency = "1/week" | "1/day";
export type RuleInfo = {
  name: string;
  condition: string;
  creatives?: string[];
  yt_creatives?: string[];
  bid?: number;
  yt_bid?: number;
  frequency_io?: Frequency;
  frequency_li?: Frequency;
  yt_frequency_io?: Frequency;
  yt_frequency_li?: Frequency;
}
export type FeedInfo = {
  name: string,
  url: string,
  type: 'Google Spreadsheet' | 'CSV' | 'JSON',
  key_column: string,
  external_key?: string,
  charset?: string,
  username?: string,
  password?: string,
}
export type FeedConfig = {
  name_column: string;
  score_column: string;
  geo_code_column: string;
  budget_factor_column: string;
  feeds: FeedInfo[];
}
export type ExecutionConfig = {
  notificationEmails: string;
  run_at: string; //'00:00',
  campaign_id: number;
  dv360ApiVersion: string; //'2.0 or 1.0'
  reallocateBudgets: boolean;
  adjustBids: boolean;
  //v2ApiKey: '',
  //dv360NonTrVReportId: '',
  //dv360TrVReportId: '',
  //optimisationDay: 'Friday',
  //process_reports_at: '00:00',
  //downloadReports: true
}
type ConfigInfo = {
  rules: RuleInfo[]
  feedInfo: FeedConfig
  dv360Template: DV360Template
  execution: ExecutionConfig
};

export default class Config {
  rules: RuleInfo[]
  feedInfo: FeedConfig
  dv360Template: DV360Template
  execution: ExecutionConfig

  constructor() {
    this.rules = [];
    this.feedInfo = {
      name_column: '',
      score_column: '',
      geo_code_column: '',
      budget_factor_column: '',
      feeds: []
    };
    this.dv360Template = {
      template_campaign: '',
      campaign_name: '',
      total_budget: '',
      io_template: '{base_name}-{row_name}-{tier_name}',
      li_template: '{base_name}-{row_name}-{tier_name}',
      yt_io_template: '{base_name}-{row_name}-{tier_name}',
      yt_li_template: '{base_name}-{row_name}-{tier_name}',
      adgroup_template: '{base_name}-{row_name}-{tier_name}',
      ad_template: '{base_name}-{row_name}-{tier_name}',
      sdf_version: '5.1',
      destination_folder: ''
    };
    this.execution = {
      notificationEmails: '',
      run_at: '00:00',
      campaign_id: 3242703,
      dv360ApiVersion: '1.0', //'2.0 or 1.0'
      reallocateBudgets: true,
      adjustBids: true
    };
  }
}