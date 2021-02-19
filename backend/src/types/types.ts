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
  Campaign: {
    CampaignId: "Campaign Id",
    AdvertiserId: "Advertiser Id",
    Name: "Name",
    Timestamp: "Timestamp",
    Status: "Status",
    CampaignGoal: "Campaign Goal",
    CampaignGoalKPI: "Campaign Goal KPI",
    CampaignGoalKPIValue: "Campaign Goal KPI Value",
    CreativeTypes: "Creative Types",
    CampaignBudget: "Campaign Budget",
    CampaignStartDate: "Campaign Start Date",
    CampaignEndDate: "Campaign End Date",
    FrequencyEnabled: "Frequency Enabled",
    FrequencyExposures: "Frequency Exposures",
    FrequencyPeriod: "Frequency Period",
    FrequencyAmount: "Frequency Amount",
    DemographicTargetingGender: "Demographic Targeting Gender",
    DemographicTargetingAge: "Demographic Targeting Age",
    DemographicTargetingHouseholdIncome: "Demographic Targeting Household Income",
    DemographicTargetingParentalStatus: "Demographic Targeting Parental Status",
    GeographyTargeting_Include: "Geography Targeting_Include",
    GeographyTargeting_Exclude: "Geography Targeting_Exclude",
    LanguageTargeting_Include: "Language Targeting_Include",
    LanguageTargeting_Exclude: "Language Targeting_Exclude",
    DigitalContentLabels_Exclude: "Digital Content Labels_Exclude",
    BrandSafetySensitivitySetting: "Brand Safety Sensitivity Setting",
    BrandSafetyCustomSettings: "Brand Safety Custom Settings",
    ThirdPartyVerificationServices: "Third Party Verification Services",
    ThirdPartyVerificationLabels: "Third Party Verification Labels",
    ViewabilityTargetingActiveView: "Viewability Targeting Active View",
    ViewabilityTargetingAdPosition_Include: "Viewability Targeting Ad Position_Include",
    ViewabilityTargetingAdPosition_Exclude: "Viewability Targeting Ad Position_Exclude",
    InventorySourceTargeting_AuthorizedSellerOnly: "Inventory Source Targeting_Authorized Seller Only",
    InventorySourceTargeting_Include: "Inventory Source Targeting_Include",
    InventorySourceTargeting_Exclude: "Inventory Source Targeting_Exclude",
    InventorySourceTargeting_TargetNewExchanges: "Inventory Source Targeting_Target New Exchanges",
    EnvironmentTargeting: "Environment Targeting"
  },
  IO: {
    IoId: "Io Id",
    CampaignId: "Campaign Id",
    Name: "Name",
    Timestamp: "Timestamp",
    Status: "Status",
    IoType: "Io Type",
    Fees: "Fees",
    IntegrationCode: "Integration Code",
    Details: "Details",
    Pacing: "Pacing",
    PacingRate: "Pacing Rate",
    PacingAmount: "Pacing Amount",
    FrequencyEnabled: "Frequency Enabled",
    FrequencyExposures: "Frequency Exposures",
    FrequencyPeriod: "Frequency Period",
    FrequencyAmount: "Frequency Amount",
    PerformanceGoalType: "Performance Goal Type",
    PerformanceGoalValue: "Performance Goal Value",
    MeasureDAR: "Measure DAR",
    MeasureDARChannel: "Measure DAR Channel",
    BudgetType: "Budget Type",
    BudgetSegments: "Budget Segments",
    AutoBudgetAllocation: "Auto Budget Allocation",
    GeographyTargeting_Include: "Geography Targeting_Include",
    GeographyTargeting_Exclude: "Geography Targeting_Exclude",
    LanguageTargeting_Include: "Language Targeting_Include",
    LanguageTargeting_Exclude: "Language Targeting_Exclude",
    DeviceTargeting_Include: "Device Targeting_Include",
    DeviceTargeting_Exclude: "Device Targeting_Exclude",
    BrowserTargeting_Include: "Browser Targeting_Include",
    BrowserTargeting_Exclude: "Browser Targeting_Exclude",
    DigitalContentLabels_Exclude: "Digital Content Labels_Exclude",
    BrandSafetySensitivitySetting: "Brand Safety Sensitivity Setting",
    BrandSafetyCustomSettings: "Brand Safety Custom Settings",
    ThirdPartyVerificationServices: "Third Party Verification Services",
    ThirdPartyVerificationLabels: "Third Party Verification Labels",
    ChannelTargeting_Include: "Channel Targeting_Include",
    ChannelTargeting_Exclude: "Channel Targeting_Exclude",
    SiteTargeting_Include: "Site Targeting_Include",
    SiteTargeting_Exclude: "Site Targeting_Exclude",
    AppTargeting_Include: "App Targeting_Include",
    AppTargeting_Exclude: "App Targeting_Exclude",
    AppCollectionTargeting_Include: "App Collection Targeting_Include",
    AppCollectionTargeting_Exclude: "App Collection Targeting_Exclude",
    CategoryTargeting_Include: "Category Targeting_Include",
    CategoryTargeting_Exclude: "Category Targeting_Exclude",
    KeywordTargeting_Include: "Keyword Targeting_Include",
    KeywordTargeting_Exclude: "Keyword Targeting_Exclude",
    KeywordListTargeting_Exclude: "Keyword List Targeting_Exclude",
    AudienceTargeting_SimilarAudiences: "Audience Targeting_Similar Audiences",
    AudienceTargeting_Include: "Audience Targeting_Include",
    AudienceTargeting_Exclude: "Audience Targeting_Exclude",
    AffinityInMarketTargeting_Include: "Affinity & In Market Targeting_Include",
    AffinityInMarketTargeting_Exclude: "Affinity & In Market Targeting_Exclude",
    CustomListTargeting: "Custom List Targeting",
    InventorySourceTargeting_AuthorizedSellerOnly: "Inventory Source Targeting_Authorized Seller Only",
    InventorySourceTargeting_Include: "Inventory Source Targeting_Include",
    InventorySourceTargeting_Exclude: "Inventory Source Targeting_Exclude",
    InventorySourceTargeting_TargetNewExchanges: "Inventory Source Targeting_Target New Exchanges",
    DaypartTargeting: "Daypart Targeting",
    DaypartTargetingTimeZone: "Daypart Targeting Time Zone",
    EnvironmentTargeting: "Environment Targeting",
    ViewabilityTargetingActiveView: "Viewability Targeting Active View",
    ViewabilityTargetingAdPosition_Include: "Viewability Targeting Ad Position_Include",
    ViewabilityTargetingAdPosition_Exclude: "Viewability Targeting Ad Position_Exclude",
    VideoAdPositionTargeting: "Video Ad Position Targeting",
    VideoPlayerSizeTargeting: "Video Player Size Targeting",
    DemographicTargetingGender: "Demographic Targeting Gender",
    DemographicTargetingAge: "Demographic Targeting Age",
    DemographicTargetingHouseholdIncome: "Demographic Targeting Household Income",
    DemographicTargetingParentalStatus: "Demographic Targeting Parental Status",
    ConnectionSpeedTargeting: "Connection Speed Targeting",
    CarrierTargeting_Include: "Carrier Targeting_Include",
    CarrierTargeting_Exclude: "Carrier Targeting_Exclude"
  },
  LI: {
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
    GeographyTargeting_Include: "Geography Targeting_Include",
    GeographyTargeting_Exclude: "Geography Targeting_Exclude",
    LanguageTargeting_Include: "Language Targeting_Include",
    LanguageTargeting_Exclude: "Language Targeting_Exclude",
    DeviceTargeting_Include: "Device Targeting_Include",
    DeviceTargeting_Exclude: "Device Targeting_Exclude",
    BrowserTargeting_Include: "Browser Targeting_Include",
    BrowserTargeting_Exclude: "Browser Targeting_Exclude",
    DigitalContentLabels_Exclude: "Digital Content Labels_Exclude",
    BrandSafetySensitivitySetting: "Brand Safety Sensitivity Setting",
    BrandSafetyCustomSettings: "Brand Safety Custom Settings",
    ThirdPartyVerificationServices: "Third Party Verification Services",
    ThirdPartyVerificationLabels: "Third Party Verification Labels",
    ChannelTargeting_Include: "Channel Targeting_Include",
    ChannelTargeting_Exclude: "Channel Targeting_Exclude",
    SiteTargeting_Include: "Site Targeting_Include",
    SiteTargeting_Exclude: "Site Targeting_Exclude",
    AppTargeting_Include: "App Targeting_Include",
    AppTargeting_Exclude: "App Targeting_Exclude",
    AppCollectionTargeting_Include: "App Collection Targeting_Include",
    AppCollectionTargeting_Exclude: "App Collection Targeting_Exclude",
    CategoryTargeting_Include: "Category Targeting_Include",
    CategoryTargeting_Exclude: "Category Targeting_Exclude",
    KeywordTargeting_Include: "Keyword Targeting_Include",
    KeywordTargeting_Exclude: "Keyword Targeting_Exclude",
    KeywordListTargeting_Exclude: "Keyword List Targeting_Exclude",
    AudienceTargeting_SimilarAudiences: "Audience Targeting_Similar Audiences",
    AudienceTargeting_Include: "Audience Targeting_Include",
    AudienceTargeting_Exclude: "Audience Targeting_Exclude",
    AffinityInMarketTargeting_Include: "Affinity & In Market Targeting_Include",
    AffinityInMarketTargeting_Exclude: "Affinity & In Market Targeting_Exclude",
    CustomListTargeting: "Custom List Targeting",
    InventorySourceTargeting_AuthorizedSellerOnly: "Inventory Source Targeting_Authorized Seller Only",
    InventorySourceTargeting_Include: "Inventory Source Targeting_Include",
    InventorySourceTargeting_Exclude: "Inventory Source Targeting_Exclude",
    InventorySourceTargeting_TargetNewExchanges: "Inventory Source Targeting_Target New Exchanges",
    DaypartTargeting: "Daypart Targeting",
    DaypartTargetingTimeZone: "Daypart Targeting Time Zone",
    EnvironmentTargeting: "Environment Targeting",
    ViewabilityTargetingActiveView: "Viewability Targeting Active View",
    ViewabilityTargetingAdPosition_Include: "Viewability Targeting Ad Position_Include",
    ViewabilityTargetingAdPosition_Exclude: "Viewability Targeting Ad Position_Exclude",
    VideoAdPositionTargeting: "Video Ad Position Targeting",
    VideoPlayerSizeTargeting: "Video Player Size Targeting",
    DemographicTargetingGender: "Demographic Targeting Gender",
    DemographicTargetingAge: "Demographic Targeting Age",
    DemographicTargetingHouseholdIncome: "Demographic Targeting Household Income",
    DemographicTargetingParentalStatus: "Demographic Targeting Parental Status",
    ConnectionSpeedTargeting: "Connection Speed Targeting",
    CarrierTargeting_Include: "Carrier Targeting_Include",
    CarrierTargeting_Exclude: "Carrier Targeting_Exclude",
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
  AdGroup: {
    AdGroupId: "Ad Group Id",
    LineItemId: "Line Item Id",
    Name: "Name",
    Status: "Status",
    VideoAdFormat: "Video Ad Format",
    MaxCost: "Max Cost",
    PopularVideosBidAdjustment: "Popular Videos Bid Adjustment",
    KeywordTargeting_Include: "Keyword Targeting_Include",
    KeywordTargeting_Exclude: "Keyword Targeting_Exclude",
    CategoryTargeting_Include: "Category Targeting_Include",
    CategoryTargeting_Exclude: "Category Targeting_Exclude",
    PlacementTargeting_YouTubeChannels_Include: "Placement Targeting_YouTube Channels_Include",
    PlacementTargeting_YouTubeChannels_Exclude: "Placement Targeting_YouTube Channels_Exclude",
    PlacementTargeting_YouTubeVideos_Include: "Placement Targeting_YouTube Videos_Include",
    PlacementTargeting_YouTubeVideos_Exclude: "Placement Targeting_YouTube Videos_Exclude",
    PlacementTargeting_URLs_Include: "Placement Targeting_URLs_Include",
    PlacementTargeting_URLs_Exclude: "Placement Targeting_URLs_Exclude",
    PlacementTargeting_Apps_Include: "Placement Targeting_Apps_Include",
    PlacementTargeting_Apps_Exclude: "Placement Targeting_Apps_Exclude",
    PlacementTargeting_AppCollections_Include: "Placement Targeting_App Collections_Include",
    PlacementTargeting_AppCollections_Exclude: "Placement Targeting_App Collections_Exclude",
    DemographicTargetingGender: "Demographic Targeting Gender",
    DemographicTargetingAge: "Demographic Targeting Age",
    DemographicTargetingHouseholdIncome: "Demographic Targeting Household Income",
    DemographicTargetingParentalStatus: "Demographic Targeting Parental Status",
    AudienceTargeting_Include: "Audience Targeting_Include",
    AudienceTargeting_Exclude: "Audience Targeting_Exclude",
    AffinityInMarketTargeting_Include: "Affinity & In Market Targeting_Include",
    AffinityInMarketTargeting_Exclude: "Affinity & In Market Targeting_Exclude",
    CustomListTargeting: "Custom List Targeting"
  },
  Ad: {
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
    VideoDiscoveryVideoThumbnail: "Video Discovery Video Thumbnail",
    VideoDiscoveryHeadline: "Video Discovery Headline",
    VideoDiscoveryDescription1: "Video Discovery Description 1",
    VideoDiscoveryDescription2: "Video Discovery Description 2",
    VideoDiscoveryLandingPage: "Video Discovery Landing Page"
  }
}