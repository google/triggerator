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
import _ from 'lodash';
import { tryParseNumber } from '../app/utils';

type FeedDataOptions = 'parseNumbers' | 'buildIndex';

export class FeedData {
  recordSet: RecordSet;
  constructor(/* public feedInfo: FeedInfo, */ private values: Record<string, any>[], options?: FeedDataOptions) {
    if (options && options === 'parseNumbers') {
      for (const row of values) {
        _.forOwn(row, (val, key, row) => {
          let parsed = tryParseNumber(val);
          if (parsed !== undefined) {
            row[key] = parsed;
          }
        })
      }
    }
    this.recordSet = RecordSet.fromValues(values);
  }

  // get name(): string {
  //   return this.feedInfo.name;
  // }

  get rowCount(): number {
    return this.values.length;
  }
  get columns(): string[] {
    return this.recordSet.columns;
  }
  get(column: string, row: number): any {
    return this.recordSet.get(column, row);
  }
  set(column: string, row: number, value: any): FeedData {
    this.recordSet.set(column, row, value);
    return this;
  }
  getRow(rowNum: number): Record<string, any> {
    return this.recordSet.getRow(rowNum);
  }
}

export class RecordSet {
  columns: string[];
  values: Record<string, any>[];
  columnNameToIndexMap: Record<string, number>;

  private constructor(columns: string[], values?: Record<string, any>[]) {
    if (!columns || !columns.length) throw new Error(`[RecordSet] columns are empty`);
    if (values) {
      this.values = values;
    } else {
      this.values = [];
    }
    this.columns = columns;
    this.columnNameToIndexMap = {}
    _.forEach(this.columns, (name: string, idx: number) => {
      this.columnNameToIndexMap[name] = idx
    });
  }
  static fromValues(values: Record<string, any>[]): RecordSet {
    if (!values || !values.length) throw new Error(`[RecordSet] InvalidArgument: values are empty`);
    let columns = Object.keys(values[0]);
    if (!_.isPlainObject(values[0])) throw new Error(`[RecordSet] expected an array of objects, got ${typeof values[0]}`);
    return new RecordSet(columns, values);
  }
  static fromMetadata(columns: string[]): RecordSet {
    return new RecordSet(columns);
  }
  /**
   * Returns total number of rows.
   */
  get rowCount(): number {
    return this.values.length;
  }
  /**
   * Returns a value of property `column` of object at specified index.
   * @param column Column name to look up
   * @param rowNum Index row to look up
   */
  get(column: string, rowNum: number): string {
    let row = this.getRow(rowNum);
    return this.getRow(rowNum)[column];
  }
  /**
   * Overwrite a value of property `column` of object at specified index.
   * @param column Columns name to overwrite
   * @param rowNum Index row
   * @param value Column value to overwrite
   */
  set(column: string, rowNum: number, value: any): RecordSet {
    let row = this.getRow(rowNum);
    if (!row) throw new Error(`[RecordSet] invalid row index ${rowNum}`);
    row[column] = value;
    return this;
  }
  /**
   * Returns a row at specified index, optionally including only specified properties.
   * @param rowNum Row index to return. Can be negative_then it's used as offset from the end (e.g. -1 means update the last row).
   * @param [columns] A list of columns to include (of omitted a whole object will be returned)
   */
  getRow(rowNum: number, ...columns: string[]): Record<string, any> {
    if (rowNum < 0)
      rowNum = this.values.length + rowNum;
    let row = this.values[rowNum];
    if (!row) throw new Error(`[RecordSet] invalid row index ${rowNum} (rowCount=${this.rowCount})`);
    if (!columns || !columns.length)
      return row;
    return _.pick(row, columns);
  }
  /**
   * Adds a new object to the end.
   * @param values A new object to add
   * @returns Index of the new row
   */
  addRow(values: Record<string, any>): number {
    // TODO: should we check columns of new object to be same
    this.values.push(values);
    return this.values.length - 1;
  }
  /**
   * Update a row at `rowNum` index with specified values.
   * @param rowNum Row number to update, can be negative_then it's used as offset from the end (e.g. -1 means update the last row).
   * @param values Values to update with
   */
  updateRow(rowNum: number, values: Record<string, any>) {
    if (rowNum < 0)
      rowNum = this.values.length + rowNum;
    let target = this.values[rowNum];
    if (!target) throw new Error(`[RecordSet] invalid row number ${rowNum}, rowCount: ${this.rowCount}`);
    _.forIn(values, (value, key) => {
      target[key] = value;
    });
  }
  removeRow(rowNum: number) {
    if (rowNum < 0)
      rowNum = this.values.length + rowNum;
    this.values.splice(rowNum, 1);
  }
  /**
   * Returns an array of indices of objects those `column`'s values equal to `val`.
   * @param column Column name to filter by
   * @param val A value to filter by
   */
  findAll(column: string, val: any): number[] {
    let indeces: number[] = [];
    _.forEach(this.values, (row: Record<string, any>, idx: number) => {
      if (row[column] == val) {
        indeces.push(idx);
      }
    });
    return indeces;
  }
  /**
   * Returns an empty RecordSet with columns copied from the current one.
   */
  cloneMetadata(): RecordSet {
    return new RecordSet(this.columns.slice(0));
  }
  /**
   * Return a copy of current RecordSet with shallow copies of values.
   */
  clone(): RecordSet {
    let values = this.values.map((row, idx) => {
      return _.clone(row);
    });
    return new RecordSet(this.columns.slice(0), values);
  }
}

export interface SdfFull {
  advertiserId: string;
  campaigns: RecordSet;
  insertionOrders: RecordSet;
  lineItems?: RecordSet;
  adGroups?: RecordSet;
  ads?: RecordSet;
}

export interface SdfRuntime {
  //campaigns: RecordSet;
  advertiserId: string;
  insertionOrders: RecordSet;
  lineItems: RecordSet;
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
  LI: {
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