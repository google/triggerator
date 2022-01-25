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
/**
 * Macros for using in name templates for IO/LI/etc
 */
export enum TemplateMacros {
  row_name = '{row_name}',
  rule_name = '{rule_name}',
  base_name = '{base_name}'
}
export enum FrequencyPeriod {
  "week" = "week",
  "day" = "day",
  "month" = "month"
}
export type RuleState = {
  creatives?: string;
  bid?: string | number;
  /** Frequency in format X/[week|day|month], X is a number, e.g. 1/week, 3/day, 2/month */
  frequency_io?: string;
  frequency_li?: string;
}
export type RuleInfo = {
  name: string;
  condition: string;
  display_state?: RuleState;
  youtube_state?: RuleState;
}
export enum FeedType {
  "Auto" = "Auto",
  "JSON" = "JSON",
  "JSONL" = "JSONL",
  "CSV" = "CSV",
  "GoogleSpreadsheet" = "Google Spreadsheet",
  "GoogleCloudBigQuery" = "Google Cloud BigQuery"
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
export const Feed_BigQuery_Url_RegExp = "(projects\/(?<project>[^\/]+)\/)?datasets\/(?<dataset>[^\/]+)\/(tables\/(?<table>.+)|views\/(?<view>.+)|procedures\/(?<proc>.+))";

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
  notificationsEnabled?: boolean;
  //run_at?: string; //'00:00',
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
  Campaign = "Campaign",
  IO = "IO", //Insertion Orders
  LI = "LI", //Line Items
  AdGroup = "AdGroup",
  Ad = "Ad"
}
export type CustomFields = {
  rule_name: string,
  media: '' | 'Display' | 'YouTube',
  sdf_type: SdfElementType | undefined,
  sdf_field: string,
  value: string
}
export interface Config {
  execution?: ExecutionConfig
  dv360Template?: DV360TemplateInfo
  rules?: RuleInfo[]
  feedInfo?: FeedConfig
  customFields?: CustomFields[];
  title?: string;
  id?: string;
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
      advertiserId: '',
      campaignId: '',
      //dv360ApiVersion: '1.0', //'2.0 or 1.0'
      //reallocateBudgets: true,
      //adjustBids: true,
      notificationEmails: '',
      notificationsEnabled: false
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

export interface AppInfo {
  /** Configuration title */
  name?: string;
  /** Configuration id (equals to spreadsheet id) */
  configId: string;
  /** Version of configuration (currently always "1") */
  version: string;
  /** Descriptive status of last run */
  status: string;
  /** Description of last run status (timestamp) */
  statusDetails?: string;
  /** The last time the file was modified by anyone (RFC 3339 date-time) */
  lastModified?: string;
  /** The last user to modify the file (email) */
  lastModifiedBy?: string;
  /** Description of scheduled job (in Cloud Scheduler) */
  job?: JobInfo;
}

export interface AppList {
  spreadsheetId: string;
  configurations: Array<AppInfo>;
}

export interface JobInfo {
  name?: string;
  enable?: boolean;
  schedule?: string;
  timeZone?: string;
}

export enum ReportFormat {
  CSV = 'CSV',
  Spreadsheet = 'Spreadsheet'
}

/**
 * Constants of all SDF fields
 */
 export var SDF = {
  Campaign: { // validated for SDF v5.3
    // See https://developers.google.com/display-video/api/structured-data-file/v5-3/Campaign
    CampaignId: "Campaign Id",
    AdvertiserId: "Advertiser Id",
    Name: "Name",
    Timestamp: "Timestamp",
    Status: "Status", // Active, Paused, Archived
    CampaignGoal: "Campaign Goal",
    CampaignGoalKPI: "Campaign Goal KPI",
    CampaignGoalKPIValue: "Campaign Goal KPI Value",
    CreativeTypes: "Creative Types",  // Display, Video, Audio
    CampaignBudget: "Campaign Budget",  // float
    CampaignStartDate: "Campaign Start Date", // MM/DD/YYYY HH:mm
    CampaignEndDate: "Campaign End Date",     // MM/DD/YYYY HH:mm
    FrequencyEnabled: "Frequency Enabled",    // TRUE, FALSE
    FrequencyExposures: "Frequency Exposures",// int
    FrequencyPeriod: "Frequency Period",      // Minutes, Hours, Days, Weeks, Months, Lifetime
    FrequencyAmount: "Frequency Amount",      // int
    DemographicTargetingGender: "Demographic Targeting Gender",
    DemographicTargetingAge: "Demographic Targeting Age",
    DemographicTargetingHouseholdIncome: "Demographic Targeting Household Income",
    DemographicTargetingParentalStatus: "Demographic Targeting Parental Status",
    GeographyTargeting_Include: "Geography Targeting - Include",
    GeographyTargeting_Exclude: "Geography Targeting - Exclude",
    LanguageTargeting_Include: "Language Targeting - Include",
    LanguageTargeting_Exclude: "Language Targeting - Exclude",
    DigitalContentLabels_Exclude: "Digital Content Labels - Exclude",
    BrandSafetySensitivitySetting: "Brand Safety Sensitivity Setting",
    BrandSafetyCustomSettings: "Brand Safety Custom Settings",
    ThirdPartyVerificationServices: "Third Party Verification Services",
    ThirdPartyVerificationLabels: "Third Party Verification Labels",
    ViewabilityTargetingActiveView: "Viewability Targeting Active View",
    PositionTargeting_DisplayOnScreen: "Position Targeting - Display On Screen",
    PositionTargeting_VideoOnScreen: "Position Targeting - Video On Screen",
    PositionTargeting_DisplayPositionInContent: "Position Targeting - Display Position In Content",
    PositionTargeting_VideoPositionInContent: "Position Targeting - Video Position In Content",
    InventorySourceTargeting_AuthorizedSellerOnly: "Inventory Source Targeting - Authorized Seller Only",
    InventorySourceTargeting_Include: "Inventory Source Targeting - Include",
    InventorySourceTargeting_Exclude: "Inventory Source Targeting - Exclude",
    InventorySourceTargeting_TargetNewExchanges: "Inventory Source Targeting - Target New Exchanges",
    EnvironmentTargeting: "Environment Targeting"
  },
  IO: { // validated for SDF v5.3
    // See https://developers.google.com/display-video/api/structured-data-file/v5-3/InsertionOrder
    IoId: "Io Id",
    CampaignId: "Campaign Id",
    Name: "Name",
    Timestamp: "Timestamp",
    Status: "Status",
    IoType: "Io Type",
    BillableOutcome: "Billable Outcome",
    Fees: "Fees",
    IntegrationCode: "Integration Code",
    Details: "Details",
    Pacing: "Pacing",
    PacingRate: "Pacing Rate",
    PacingAmount: "Pacing Amount",
    FrequencyEnabled: "Frequency Enabled",  // "TRUE" or "FALSE"
    FrequencyExposures: "Frequency Exposures",  // number
    FrequencyPeriod: "Frequency Period", // Minutes, Hours, Days, Weeks, Months, Lifetime
    FrequencyAmount: "Frequency Amount",  // number
    PerformanceGoalType: "Performance Goal Type",
    PerformanceGoalValue: "Performance Goal Value",
    MeasureDAR: "Measure DAR",
    MeasureDARChannel: "Measure DAR Channel",
    BudgetType: "Budget Type",  // Amount, Impressions
    BudgetSegments: "Budget Segments",  // (Budget, Start Date, End Date)
    AutoBudgetAllocation: "Auto Budget Allocation",  // "TRUE, "FALSE"
    GeographyTargeting_Include: "Geography Targeting - Include",
    GeographyTargeting_Exclude: "Geography Targeting - Exclude",
    LanguageTargeting_Include: "Language Targeting - Include",
    LanguageTargeting_Exclude: "Language Targeting - Exclude",
    DeviceTargeting_Include: "Device Targeting - Include",
    DeviceTargeting_Exclude: "Device Targeting - Exclude",
    BrowserTargeting_Include: "Browser Targeting - Include",
    BrowserTargeting_Exclude: "Browser Targeting - Exclude",
    DigitalContentLabels_Exclude: "Digital Content Labels - Exclude",
    BrandSafetySensitivitySetting: "Brand Safety Sensitivity Setting",
    BrandSafetyCustomSettings: "Brand Safety Custom Settings",
    ThirdPartyVerificationServices: "Third Party Verification Services",
    ThirdPartyVerificationLabels: "Third Party Verification Labels",
    ChannelTargeting_Include: "Channel Targeting - Include",
    ChannelTargeting_Exclude: "Channel Targeting - Exclude",
    SiteTargeting_Include: "Site Targeting - Include",
    SiteTargeting_Exclude: "Site Targeting - Exclude",
    AppTargeting_Include: "App Targeting - Include",
    AppTargeting_Exclude: "App Targeting - Exclude",
    AppCollectionTargeting_Include: "App Collection Targeting - Include",
    AppCollectionTargeting_Exclude: "App Collection Targeting - Exclude",
    CategoryTargeting_Include: "Category Targeting - Include",
    CategoryTargeting_Exclude: "Category Targeting - Exclude",
    KeywordTargeting_Include: "Keyword Targeting - Include",
    KeywordTargeting_Exclude: "Keyword Targeting - Exclude",
    KeywordListTargeting_Exclude: "Keyword List Targeting - Exclude",
    AudienceTargeting_SimilarAudiences: "Audience Targeting - Similar Audiences",
    AudienceTargeting_Include: "Audience Targeting - Include",
    AudienceTargeting_Exclude: "Audience Targeting - Exclude",
    AffinityInMarketTargeting_Include: "Affinity & In Market Targeting - Include",
    AffinityInMarketTargeting_Exclude: "Affinity & In Market Targeting - Exclude",
    CustomListTargeting: "Custom List Targeting",
    InventorySourceTargeting_AuthorizedSellerOnly: "Inventory Source Targeting - Authorized Seller Only",
    InventorySourceTargeting_Include: "Inventory Source Targeting - Include",
    InventorySourceTargeting_Exclude: "Inventory Source Targeting - Exclude",
    InventorySourceTargeting_TargetNewExchanges: "Inventory Source Targeting - Target New Exchanges",
    DaypartTargeting: "Daypart Targeting",
    DaypartTargetingTimeZone: "Daypart Targeting Time Zone",
    EnvironmentTargeting: "Environment Targeting",
    ViewabilityTargetingActiveView: "Viewability Targeting Active View",
    ViewabilityTargetingAdPosition_Include: "Viewability Targeting Ad Position - Include",
    ViewabilityTargetingAdPosition_Exclude: "Viewability Targeting Ad Position - Exclude",
    VideoAdPositionTargeting: "Video Ad Position Targeting",
    VideoPlayerSizeTargeting: "Video Player Size Targeting",
    DemographicTargetingGender: "Demographic Targeting Gender",
    DemographicTargetingAge: "Demographic Targeting Age",
    DemographicTargetingHouseholdIncome: "Demographic Targeting Household Income",
    DemographicTargetingParentalStatus: "Demographic Targeting Parental Status",
    ConnectionSpeedTargeting: "Connection Speed Targeting",
    CarrierTargeting_Include: "Carrier Targeting - Include",
    CarrierTargeting_Exclude: "Carrier Targeting - Exclude",
    InsertionOrderOptimization: "Insertion Order Optimization",  // "TRUE", "FALSE"
    BidStrategyUnit: "Bid Strategy Unit",
    BidStrategyDoNotExceed: "Bid Strategy Do Not Exceed", // float
    ApplyFloorPriceForDeals: "Apply Floor Price For Deals", // "TRUE", "FALSE"
    AlgorithmId: "Algorithm Id",  // integer
  },
  LI: { // validated for SDF v5.3
    // See https://developers.google.com/display-video/api/structured-data-file/v5-3/LineItem
    LineItemId: "Line Item Id",
    IoId: "Io Id",
    Type: "Type",
    Subtype: "Subtype",
    Name: "Name",
    Timestamp: "Timestamp",
    Status: "Status",
    StartDate: "Start Date",
    EndDate: "End Date",
    BudgetType: "Budget Type",
    BudgetAmount: "Budget Amount",
    Pacing: "Pacing",
    PacingRate: "Pacing Rate",
    PacingAmount: "Pacing Amount",
    FrequencyEnabled: "Frequency Enabled",
    FrequencyExposures: "Frequency Exposures",
    FrequencyPeriod: "Frequency Period",
    FrequencyAmount: "Frequency Amount",
    TrueViewViewFrequencyEnabled: "TrueView View Frequency Enabled",
    TrueViewViewFrequencyExposures: "TrueView View Frequency Exposures",
    TrueViewViewFrequencyPeriod: "TrueView View Frequency Period",
    PartnerRevenueModel: "Partner Revenue Model",
    PartnerRevenueAmount: "Partner Revenue Amount",
    ConversionCountingType: "Conversion Counting Type",
    ConversionCountingPct: "Conversion Counting Pct",
    ConversionFloodlightActivityIds: "Conversion Floodlight Activity Ids",
    Fees: "Fees",
    IntegrationCode: "Integration Code",
    Details: "Details",
    BidStrategyType: "Bid Strategy Type",
    BidStrategyValue: "Bid Strategy Value",
    BidStrategyUnit: "Bid Strategy Unit",
    BidStrategyDoNotExceed: "Bid Strategy Do Not Exceed",
    CreativeAssignments: "Creative Assignments",
    GeographyTargeting_Include: "Geography Targeting - Include",
    GeographyTargeting_Exclude: "Geography Targeting - Exclude",
    LanguageTargeting_Include: "Language Targeting - Include",
    LanguageTargeting_Exclude: "Language Targeting - Exclude",
    DeviceTargeting_Include: "Device Targeting - Include",
    DeviceTargeting_Exclude: "Device Targeting - Exclude",
    BrowserTargeting_Include: "Browser Targeting - Include",
    BrowserTargeting_Exclude: "Browser Targeting - Exclude",
    DigitalContentLabels_Exclude: "Digital Content Labels - Exclude",
    BrandSafetySensitivitySetting: "Brand Safety Sensitivity Setting",
    BrandSafetyCustomSettings: "Brand Safety Custom Settings",
    ThirdPartyVerificationServices: "Third Party Verification Services",
    ThirdPartyVerificationLabels: "Third Party Verification Labels",
    ChannelTargeting_Include: "Channel Targeting - Include",
    ChannelTargeting_Exclude: "Channel Targeting - Exclude",
    SiteTargeting_Include: "Site Targeting - Include",
    SiteTargeting_Exclude: "Site Targeting - Exclude",
    AppTargeting_Include: "App Targeting - Include",
    AppTargeting_Exclude: "App Targeting - Exclude",
    AppCollectionTargeting_Include: "App Collection Targeting - Include",
    AppCollectionTargeting_Exclude: "App Collection Targeting - Exclude",
    CategoryTargeting_Include: "Category Targeting - Include",
    CategoryTargeting_Exclude: "Category Targeting - Exclude",
    KeywordTargeting_Include: "Keyword Targeting - Include",
    KeywordTargeting_Exclude: "Keyword Targeting - Exclude",
    KeywordListTargeting_Exclude: "Keyword List Targeting - Exclude",
    AudienceTargeting_SimilarAudiences: "Audience Targeting - Similar Audiences",
    AudienceTargeting_Include: "Audience Targeting - Include",
    AudienceTargeting_Exclude: "Audience Targeting - Exclude",
    AffinityInMarketTargeting_Include: "Affinity & In Market Targeting - Include",
    AffinityInMarketTargeting_Exclude: "Affinity & In Market Targeting - Exclude",
    CustomListTargeting: "Custom List Targeting",
    InventorySourceTargeting_AuthorizedSellerOnly: "Inventory Source Targeting - Authorized Seller Only",
    InventorySourceTargeting_Include: "Inventory Source Targeting - Include",
    InventorySourceTargeting_Exclude: "Inventory Source Targeting - Exclude",
    InventorySourceTargeting_TargetNewExchanges: "Inventory Source Targeting - Target New Exchanges",
    DaypartTargeting: "Daypart Targeting",
    DaypartTargetingTimeZone: "Daypart Targeting Time Zone",
    EnvironmentTargeting: "Environment Targeting",
    ViewabilityTargetingActiveView: "Viewability Targeting Active View",
    ViewabilityTargetingAdPosition_Include: "Viewability Targeting Ad Position - Include",
    ViewabilityTargetingAdPosition_Exclude: "Viewability Targeting Ad Position - Exclude",
    VideoAdPositionTargeting: "Video Ad Position Targeting",
    VideoPlayerSizeTargeting: "Video Player Size Targeting",
    DemographicTargetingGender: "Demographic Targeting Gender",
    DemographicTargetingAge: "Demographic Targeting Age",
    DemographicTargetingHouseholdIncome: "Demographic Targeting Household Income",
    DemographicTargetingParentalStatus: "Demographic Targeting Parental Status",
    ConnectionSpeedTargeting: "Connection Speed Targeting",
    CarrierTargeting_Include: "Carrier Targeting - Include",
    CarrierTargeting_Exclude: "Carrier Targeting - Exclude",
    BidMultipliers: "Bid Multipliers",
    TrueViewVideoAdFormats: "TrueView Video Ad Formats",
    TrueViewMobileBidAdjustmentOption: "TrueView Mobile Bid Adjustment Option",
    TrueViewMobileBidAdjustmentPercentage: "TrueView Mobile Bid Adjustment Percentage",
    TrueViewDesktopBidAdjustmentOption: "TrueView Desktop Bid Adjustment Option",
    TrueViewDesktopBidAdjustmentPercentage: "TrueView Desktop Bid Adjustment Percentage",
    TrueViewTabletBidAdjustmentOption: "TrueView Tablet Bid Adjustment Option",
    TrueViewTabletBidAdjustmentPercentage: "TrueView Tablet Bid Adjustment Percentage",
    TrueViewConnectedTVBidAdjustmentOption: "TrueView Connected TV Bid Adjustment Option",
    TrueViewConnectedTVBidAdjustmentPercentage: "TrueView Connected TV Bid Adjustment Percentage",
    TrueViewCategoryExclusionsTargeting: "TrueView Category Exclusions Targeting",
    TrueViewContentFilter: "TrueView Content Filter",
    TrueViewInventorySourceTargeting: "TrueView Inventory Source Targeting"
  },
  AdGroup: { // validated for SDF v5.3
    AdGroupId: "Ad Group Id",
    LineItemId: "Line Item Id",
    Name: "Name",
    Status: "Status",
    VideoAdFormat: "Video Ad Format",
    BidCost: "Bid Cost",
    PopularVideosBidAdjustment: "Popular Videos Bid Adjustment",
    KeywordTargeting_Include: "Keyword Targeting - Include",
    KeywordTargeting_Exclude: "Keyword Targeting - Exclude",
    CategoryTargeting_Include: "Category Targeting - Include",
    CategoryTargeting_Exclude: "Category Targeting - Exclude",
    PlacementTargeting_YouTubeChannels_Include: "Placement Targeting - YouTube Channels - Include",
    PlacementTargeting_YouTubeChannels_Exclude: "Placement Targeting - YouTube Channels - Exclude",
    PlacementTargeting_YouTubeVideos_Include: "Placement Targeting - YouTube Videos - Include",
    PlacementTargeting_YouTubeVideos_Exclude: "Placement Targeting - YouTube Videos - Exclude",
    PlacementTargeting_PopularContent_Include: "Placement Targeting - Popular Content - Include",
    PlacementTargeting_URLs_Include: "Placement Targeting - URLs - Include",
    PlacementTargeting_URLs_Exclude: "Placement Targeting - URLs - Exclude",
    PlacementTargeting_Apps_Include: "Placement Targeting - Apps - Include",
    PlacementTargeting_Apps_Exclude: "Placement Targeting - Apps - Exclude",
    PlacementTargeting_AppCollections_Include: "Placement Targeting - App Collections - Include",
    PlacementTargeting_AppCollections_Exclude: "Placement Targeting - App Collections - Exclude",
    DemographicTargetingGender: "Demographic Targeting Gender",
    DemographicTargetingAge: "Demographic Targeting Age",
    DemographicTargetingHouseholdIncome: "Demographic Targeting Household Income",
    DemographicTargetingParentalStatus: "Demographic Targeting Parental Status",
    AudienceTargeting_Include: "Audience Targeting - Include",
    AudienceTargeting_Exclude: "Audience Targeting - Exclude",
    AffinityInMarketTargeting_Include: "Affinity & In Market Targeting - Include",
    AffinityInMarketTargeting_Exclude: "Affinity & In Market Targeting - Exclude",
    CustomListTargeting: "Custom List Targeting"
  },
  Ad: { // validated for SDF v5.3
    AdId: "Ad Id",
    AdGroupId: "Ad Group Id",
    Name: "Name",
    Status: "Status",
    VideoId: "Video Id",
    DisplayURL: "Display URL",
    LandingPageURL: "Landing Page URL",
    DCMTracking_PlacementId: "DCM Tracking - Placement Id",
    DCMTracking_AdId: "DCM Tracking - Ad Id",
    DCMTracking_CreativeId: "DCM Tracking - Creative Id",
    ClickTrackerURL: "Click Tracker URL",
    InstreamCustomParameters: "In-stream Custom Parameters",
    ActionButtonLabel: "Action Button Label",
    ActionHeadline: "Action Headline",
    VideoDiscoveryVideoThumbnail: "Video Discovery Video Thumbnail",
    VideoDiscoveryHeadline: "Video Discovery Headline",
    VideoDiscoveryDescription1: "Video Discovery Description 1",
    VideoDiscoveryDescription2: "Video Discovery Description 2",
    VideoDiscoveryLandingPage: "Video Discovery Landing Page"
  }
}

export const SDF_VERSION = '5.3'; // the latest supported SDF Version (see https://developers.google.com/display-video/api/structured-data-file/rel-notes?hl=en)