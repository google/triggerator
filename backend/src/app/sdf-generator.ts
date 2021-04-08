import _ from 'lodash';
import { Config, DV360TemplateInfo, FrequencyPeriod, RuleInfo, SdfElementType } from '../types/config';
import RuleEngine, { RuleEvaluator } from './rule-engine';
import { FeedData, RecordSet, SDF, SdfFull } from '../types/types';

type FrequencyInfo = {
  exposures: number,
  period: string,
  amount: number
};
class DV360Template {
  info: DV360TemplateInfo;
  //isTrueView = false;

  constructor(template: DV360TemplateInfo) {
    if (!template)
      throw new Error();

    this.info = template;
  }

  private generate(tmpl: string, base: string, rowName: string, tier: string) {
    return tmpl
      .replace(/{base_name}/, base)
      .replace(/{row_name}/, rowName)
      .replace(/{tier_name}/, tier)
      .trim();
  }

  /**
   * Whather Display IO's template contains row_name (a unique label per data feed's row)
   */
  isDisplayIoPerFeedRow(): boolean {
    return this.info.io_template?.indexOf('{row_name}') != -1;
  }

  /**
   * Whather Display IO's template contains tier_name (tier is v1's name for rule)
   */
  isDisplayIoPerTier(): boolean {
    return this.info.io_template?.indexOf('{tier_name}') != -1;
  }

  /**
   * Generate an IO name.
   * @param base Campaign base name
   * @param rowName A row label
   * @param ruleName A rule name
   */
  io_name(isTrueView: boolean, base: string, rowName: string, ruleName: string) {
    // NOTE: for assertion - you have checked nullability in constructor
    return this.generate(
      <string>(isTrueView ? this.info.yt_io_template : this.info.io_template),
      base, rowName, ruleName);
  }

  /**
   * Generate a LI name.
   * @param base Campaign base
   * @param rowName A row label
   * @param ruleName A rule name
   */
  li_name(isTrueView: boolean, base: string, rowName: string, ruleName: string) {
    // NOTE: for assertion - you have checked nullability in constructor
    return this.generate(
      <string>(isTrueView ? this.info.yt_li_template : this.info.li_template),
      base, rowName, ruleName);
  }

  /**
   * Generate an AdGroup name.
   * @param base Campaign base
   * @param rowName A row label
   * @param ruleName A rule name
   */
  adgroup_name(base: string, rowName: string, ruleName: string) {
    // NOTE: for assertion - you have checked nullability in constructor
    return this.generate(<string>this.info.adgroup_template, base, rowName, ruleName);
  }

  /**
   * Generate an Ad name.
   * @param base Campaign base
   * @param rowName A row label
   * @param tier A rule name
   */
  ad_name(base: string, rowName: string, tier: string) {
    // NOTE: for assertion - you have checked nullability in constructor
    return this.generate(<string>this.info.ad_template, base, rowName, tier);
  }

  getFrequency(isTrueView: boolean, ruleInfo: RuleInfo): FrequencyInfo | null {
    let state = isTrueView
      ? ruleInfo.youtube_state?.frequency_io
      : ruleInfo.display_state?.frequency_io;
    if (!state)
      return null;
    return this.parseFrequency(state);
  }

  private parseFrequency(strf: string): FrequencyInfo {
    var f = /(\d+)\/(week|day|month)/.exec(strf);
    if (!f) throw new Error('Invalid frequency format: ' + strf);
    var period;
    switch (f[2]) {
      case FrequencyPeriod.day:
        period = 'Days';
        break;
      case FrequencyPeriod.week:
        period = 'Weeks';
        break;
      case FrequencyPeriod.month:
        period = 'Months';
        break;
      default:
        throw new Error(`Can't parse frequency ${f[2]}, supported ones are 'day', 'week', 'month'`);
    }

    return {
      exposures: parseInt(f[1]),
      period: period,
      amount: 1
    };
  }
}

export default class SdfGenerator {
  targetIoMap: Record<string, number> = {};
  targetLiMap: Record<string, number> = {};
  /**
   * A mapping of IO Ids from template campaing to IsTrueView flag.
   */
  trueViewTmplIOs: Record<string, boolean> = {};
  existingIosMap: Record<string, boolean> = {};
  /**
   * A list (actually mapping to true) of existing "Line Item Id".
   */
  existingLisMap: Record<string, boolean> = {};
  existingAdGroupsMap: Record<string, boolean> = {};
  existingAdsMap: Record<string, boolean> = {};
  resultIosMap: Record<string, string> = {};
  /**
   * A mapping of keys consisting of 'Line Item Id' + city + tierName (rule) 
   * to LI's indecies in `currentSdf.lineItems` (existing LI)
   */
  sourceToDestLineItem: Record<string, number> = {};
  sourceToDestAdGroup: Record<string, number> = {};
  recalculateStatus = false;
  autoActivate = false;
  startDate?: Date;
  endDate?: Date;

  constructor(private config: Config, private ruleEvaluator: RuleEvaluator,
    private feedData: FeedData,
    private tmplSdf: SdfFull, private currentSdf: SdfFull | null) {

  }

  validateTemplates(dv360Template: DV360TemplateInfo | undefined): asserts dv360Template {
    if (!dv360Template)
      throw new Error('[SdfGenerator] config.dv360Template is empty');
    // Не всё так однозначно :-/
    // if (!dv360Template.io_template)
    //   throw new Error('[SdfGenerator] Template for IO names is empty in configuration (config.dv360Template.io_template)');
    // if (!dv360Template.li_template)
    //   throw new Error('[SdfGenerator] Template for IO names is empty in configuration (config.dv360Template.io_template)');
    /*
    if (!template.io_template)
      throw new Error();
    if (!template.li_template)
      throw new Error();
    if (!template.ad_template)
      throw new Error();
    if (!template.adgroup_template)
      throw new Error();
    if (!template.yt_io_template)
      throw new Error();
    if (!template.yt_li_template)
      throw new Error();
     */
  }

  generate() {
    // NOTE: we assume that config has been validated already (via ConfigService)
    let dv360Template = this.config.dv360Template;
    this.validateTemplates(dv360Template);

    let tmpl = new DV360Template(dv360Template);

    let campaignId;
    let tmplSdf = this.tmplSdf;
    let currentSdf = this.currentSdf; // can be null if we're not updating

    let new_campaign: Record<string, string>;
    if (currentSdf != null && currentSdf.campaigns != null) {
      // updating existing
      campaignId = currentSdf.campaigns.get(SDF.Campaign.CampaignId, -1);
      new_campaign = currentSdf.campaigns.getRow(0,
        SDF.Campaign.Name, SDF.Campaign.CampaignId, SDF.Campaign.Timestamp, SDF.Campaign.Status);
    } else {
      // generating new
      if (!dv360Template.campaign_name)
        throw new Error(`[SdfGenerator] New campaign name is not specified in configuration`);
      campaignId = 'ext' + tmplSdf.campaigns.get(SDF.Campaign.CampaignId, -1);
      new_campaign = {
        [SDF.Campaign.Name]: dv360Template.campaign_name,
        [SDF.Campaign.CampaignId]: campaignId
      }
    }
    if (this.autoActivate)
      new_campaign[SDF.Campaign.Status] = 'Active';
    if (this.startDate) {
      new_campaign[SDF.Campaign.CampaignStartDate] = this.formatDate(this.startDate);
    }
    if (this.endDate) {
      new_campaign[SDF.Campaign.CampaignEndDate] = this.formatDate(this.endDate);
    }
    this.recalculateStatus = new_campaign[SDF.Campaign.Status] == 'Active';

    // template campaign can be empty, or contains only IOs, or IOs and LIs, or IOs/LIs and AdGroups (for TrueView only)
    // The only requirement is existence of IOs
    if (!tmplSdf.insertionOrders || tmplSdf.insertionOrders.rowCount == 0) {
      throw new Error(`[SdfGenerator] Template campaign ${campaignId} doesn't contain Insertion Orders`);
    }
    let newSdf: SdfFull = {
      advertiserId: this.config.execution!.advertiserId!,
      campaigns: tmplSdf.campaigns.clone(),
      insertionOrders: tmplSdf.insertionOrders.cloneMetadata(),
      lineItems: tmplSdf.lineItems?.cloneMetadata(),
      adGroups: tmplSdf.adGroups?.cloneMetadata(),
      ads: tmplSdf.ads?.cloneMetadata()
    };
    newSdf.campaigns.updateRow(-1, new_campaign);

    // fill trueViewIOs mapping with TrueView IO Ids
    if (tmplSdf.lineItems) {
      for (let k = 0; k < tmplSdf.lineItems.rowCount; k++) {
        // we go through line items because TrueView is their parameters
        let liType = tmplSdf.lineItems.get(SDF.LI.Type, k);
        let ioId = tmplSdf.lineItems.get(SDF.LI.IoId, k);
        // it's legal to have TrueView and non-TrueView line items inside a single IO, 
        // but we don't support such configuration
        let isTrueViewPrev = this.trueViewTmplIOs[ioId];
        let isTrueView = liType == 'TrueView';
        if (isTrueView && isTrueViewPrev === false ||
          !isTrueView && isTrueViewPrev === true) {
          throw new Error(`[SdfGenerator] Insertion order ${ioId} in template campaign ${campaignId} contains both TrueView and non-TrueView line items which is not supported`);
        }
        this.trueViewTmplIOs[ioId] = isTrueView;
      }
    }

    if (currentSdf != null) {
      // Updating
      // fill out two dictionaries: targetIoMap and targetLiMap,
      // they map keys (which includes some data from Detail field) to IO/LI indecies.
      for (let i = 0; i < currentSdf.insertionOrders.rowCount; i++) {
        let details = currentSdf.insertionOrders.get(SDF.IO.Details, i);
        let source: any = /source:(\d+)(?:\\n|$)/m.exec(details);
        let city: any = /city:(.+?)(?:\\n|$)/m.exec(details);
        let tier: any = /tier:(.+?)(?:\\n|$)/m.exec(details);

        source = source && source[1].trim();
        city = (city && city[1].trim()) || '';
        tier = (tier && tier[1].trim()) || '';

        if (source) {
          this.targetIoMap[<string>(source + city + tier)] = i;
        }
      }
      if (currentSdf.lineItems) {
        for (let i = 0; i < currentSdf.lineItems.rowCount; i++) {
          let details = currentSdf.lineItems.get(SDF.LI.Details, i);
          let source: any = /source:(\d+)/.exec(details);
          let city: any = /city:(.+?)(?:\\n|$)/m.exec(details);
          let tier: any = /tier:(.+?)(?:\\n|$)/m.exec(details);

          source = source && source[1].trim();
          city = (city && city[1].trim()) || '';
          tier = (tier && tier[1].trim()) || '';

          if (source && city && tier) {
            this.targetLiMap[currentSdf.lineItems.get(SDF.LI.IoId, i) +
              source + city + tier] = i;
          }
        }
      }
    }

    // processing IOs
    for (let k = 0; k < tmplSdf.insertionOrders.rowCount; k++) {
      let no = 0;
      let tmplIo = tmplSdf.insertionOrders.getRow(k);
      let sourceIoId = tmplIo[SDF.IO.IoId];
      let isTrueViewIO = this.trueViewTmplIOs[sourceIoId];
      if (!isTrueViewIO && !tmpl.isDisplayIoPerFeedRow()) {
        if (tmpl.isDisplayIoPerTier()) {
          // IO doesn't depend on feed row but depends on rules (NOTE: new v2 feature)
          for (const ruleInfo of this.config.rules!) {
            let new_io = this.sdf_io(isTrueViewIO, campaignId, tmplIo, null, ruleInfo, tmpl, no);
            newSdf.insertionOrders.addRow(new_io);
          }
        } else {
          // IO doesn't depend on anything (neither feed row nor rules)
          let new_io = this.sdf_io(isTrueViewIO, campaignId, tmplIo, null, null, tmpl, no);
          newSdf.insertionOrders.addRow(new_io);
        }
      }
      else {
        // IO depends on feed row (contains row_name in name template) or it's TrueView IO (and so must depend on feed row)
        for (let i = 0; i < this.feedData.rowCount; i++) {
          let feedRow = this.feedData.getRow(i);
          if (isTrueViewIO || tmpl.isDisplayIoPerTier()) {
            // IO depends on rules and feed row
            // если это TV IO или имя IO зависит от правила (есть tier_name в шаблоне имени)
            for (const ruleInfo of this.config.rules!) {
              // TODO:
              // Left from v1
              // if (isTrueViewIO && !ruleInfo.yt_frequency_io)
              //   continue;
              // if (!isTrueViewIO && !ruleInfo.frequency_io)
              //   continue;

              let new_io = this.sdf_io(isTrueViewIO, campaignId, tmplIo, feedRow, ruleInfo, tmpl, no);
              newSdf.insertionOrders.addRow(new_io);
              no++;
            }
          }
          else {
            // IO depends on feed rows
            let new_io = this.sdf_io(isTrueViewIO, campaignId, tmplIo, feedRow, null, tmpl, no);
            newSdf.insertionOrders.addRow(new_io);
            no++;
          }
        }
      }
    }

    // processing LIs
    if (tmplSdf.lineItems) {
      for (var k = 0; k < tmplSdf.lineItems.rowCount; k++) {
        var no = 0;
        let tmplLi = tmplSdf.lineItems.getRow(k);
        // get indecies of all AdGroups beloging to the current LI
        var sourceAdGroups = tmplSdf.adGroups
          ? tmplSdf.adGroups.findAll(SDF.LI.LineItemId, tmplLi[SDF.LI.LineItemId])
          : [];
        for (let i = 0; i < this.feedData.rowCount; i++) {
          let feedRow = this.feedData.getRow(i);
          for (const ruleInfo of this.config.rules!) {
            // TODO:
            // left from v1:
            // if (tmplLi['Type'] == 'TrueView' && !ruleInfo.yt_frequency_li)
            //   continue;
            // if (tmplLi['Type'] != 'TrueView' && !ruleInfo.frequency_li)
            //   continue;

            let new_li = this.sdf_li(tmplLi, feedRow, ruleInfo, tmpl, sourceAdGroups, no);
            newSdf.lineItems!.addRow(new_li);
            no++;
          }
        }
      }
    }

    // processing AdDroups
    if (tmplSdf.adGroups) {
      for (let k = 0; k < tmplSdf.adGroups.rowCount; k++) {
        let no = 0;
        let tmplAg = tmplSdf.adGroups.getRow(k);
        for (let i = 0; i < this.feedData.rowCount; i++) {
          let feedRow = this.feedData.getRow(i);
          for (const rule of this.config.rules!) {
            if (!rule.youtube_state?.frequency_li)
              continue;
            let new_adgroup = this.sdf_adgroup(tmplAg, feedRow, rule, tmpl, no);
            newSdf.adGroups!.addRow(new_adgroup);
            no++;
          }
        }
      }
    }

    // processing Ads
    if (tmplSdf.ads) {
      for (let k = 0; k < tmplSdf.ads.rowCount; k++) {
        let no = 0;
        let tmplAd = tmplSdf.ads.getRow(k);
        for (let i = 0; i < this.feedData.rowCount; i++) {
          let feedRow = this.feedData.getRow(i);
          for (const rule of this.config.rules!) {
            if (!rule.youtube_state?.frequency_li)
              continue;
            let new_ad = this.sdf_ad(tmplAd, feedRow, rule, tmpl, no);
            newSdf.ads!.addRow(new_ad);
            no++;
          }
        }
      }
    }

    if (currentSdf) {
      // archiving IOs    
      for (var i = 0; i < currentSdf.insertionOrders.rowCount; i++) {
        if (!this.existingIosMap[currentSdf.insertionOrders.get(SDF.IO.IoId, i)]) {
          let new_io = _.clone(currentSdf.insertionOrders.getRow(i));
          new_io[SDF.IO.Status] = 'Archived';
          newSdf.insertionOrders.addRow(new_io);
        }
      }

      // archiving LIs
      if (currentSdf.lineItems) {
        for (var i = 0; i < currentSdf.lineItems.rowCount; i++) {
          if (!this.existingLisMap[currentSdf.lineItems.get(SDF.LI.LineItemId, i)]) {
            let new_li = _.clone(currentSdf.lineItems.getRow(i));
            new_li[SDF.LI.Status] = 'Archived';
            newSdf.lineItems!.addRow(new_li);
          }
        }
      }

      // deleting AdGroups
      if (currentSdf.adGroups) {
        for (var i = 0; i < currentSdf.adGroups.rowCount; i++) {
          if (!this.existingAdGroupsMap[currentSdf.adGroups.get(SDF.AdGroup.AdGroupId, i)]) {
            let new_adgroup = _.clone(currentSdf.adGroups.getRow(i));
            new_adgroup[SDF.AdGroup.Status] = 'Deleted';
            newSdf.adGroups!.addRow(new_adgroup);
          }
        }
      }

      // deleting Ads
      if (currentSdf.ads) {
        for (var i = 0; i < currentSdf.ads.rowCount; i++) {
          if (!this.existingAdsMap[currentSdf.ads.get(SDF.Ad.AdId, i)]) {
            let new_ad = _.clone(currentSdf.ads.getRow(i));
            new_ad[SDF.Ad.Status] = 'Deleted';
            newSdf.ads!.addRow(new_ad);
          }
        }
      }
    }

    return newSdf;
  }

  private fixDraft(status: string): string {
    return status == 'Draft' ? 'Paused' : status;
  }

  private setCustomFields(row: Record<string, string>, sdfType: SdfElementType, tierName: string,
    media: 'YouTube' | 'Display', feedRow: Record<string, string> | null) {
    if (!this.config.customFields)
      return;
    for (const cf of this.config.customFields) {
      if ((cf.element_state == 'All' || cf.element_state == tierName)
        && cf.sdf_type == sdfType
        && (cf.media == media || cf.media == '')) {
        var value = cf.feed_column;
        // TODO: here is a problem: unsafe check for column name
        if (feedRow && typeof value == 'string' && /^[a-zA-Z0-9_\-\[\]]+\.\w+$/i.test(value.trim())) {
          value = feedRow[cf.feed_column];
          if (value === undefined)
            throw new Error(`[SdfGenerator] setCustomFields: Feed column '${cf.feed_column}' not found`);
        }
        row[cf.sdf_field] = value;
      }
    }
  }

  private sdf_io(isTrueView: boolean, campaignId: string, tmplIo: Record<string, any>, feedRow: Record<string, string> | null,
    tier: RuleInfo | null, tmpl: DV360Template, entryNum: number): Record<string, any> {
    let feedInfo = this.config.feedInfo!;
    let rowName = feedRow ? feedRow[feedInfo.name_column!] : '';
    let tierName = tier ? tier.name : '';

    let sourceId = tmplIo[SDF.IO.IoId];
    let key = sourceId + rowName + tierName;
    let ioIndex = this.targetIoMap[key];
    let new_io = _.clone(tmplIo);
    new_io[SDF.IO.CampaignId] = campaignId;

    if (ioIndex > -1) {
      // updating an existing IO, so that currentSdf should exist
      let cur_io = this.currentSdf!.insertionOrders.getRow(ioIndex);
      new_io[SDF.IO.IoId] = cur_io[SDF.IO.IoId];
      new_io[SDF.IO.Timestamp] = cur_io[SDF.IO.Timestamp];
      new_io[SDF.IO.Status] = this.fixDraft(cur_io[SDF.IO.Status]);
      this.existingIosMap[cur_io[SDF.IO.IoId]] = true;
    }
    else {
      // new
      new_io[SDF.IO.IoId] = 'ext' + new_io[SDF.IO.IoId] + entryNum;
    }

    if (this.recalculateStatus) {
      if (tier)
        new_io[SDF.IO.Status] = this.ruleEvaluator.getActiveRule(this.config.rules!, feedRow!)?.name == tierName ? 'Active' : 'Paused';
      else
        new_io[SDF.IO.Status] = 'Active';
    }

    new_io[SDF.IO.Name] = tmpl.io_name(isTrueView, new_io[SDF.IO.Name], rowName, tierName);
    new_io[SDF.IO.Details] = 'source:' + sourceId + '\n' +
      'city:' + rowName + '\n' +
      'tier:' + tierName;

    this.resultIosMap[key] = new_io[SDF.IO.IoId];

    let budget;
    if (tmpl.info.total_budget) {
      if (feedRow) {
        if (feedInfo.budget_factor_column) {
          budget = tmpl.info.total_budget * Number(feedRow[feedInfo.budget_factor_column]);
        }
        else {
          budget = tmpl.info.total_budget / (this.feedData.rowCount - 1);
        }
      } else {
        budget = tmpl.info.total_budget;
      }
      new_io[SDF.IO.BudgetSegments] = new_io[SDF.IO.BudgetSegments].replace(/\([0-9.]+;/, '(' + budget + ';');
      // NOTE: otherwise new_io's budget will have a value from tempalte IO
    }
    if (!this.currentSdf) {
      // generating a new SDF, we need adjust dates in Budget Segmets of IOs
      // BudgetSegments format:
      // (Budget, Start Date, End Date). 
      // Budget is in currency floating format. Dates are in MM/DD/YYYY format. 
      // Example: "(100.50;01/01/2016;03/31/2016;);(200.00;04/01/2016;06/30/2016;);"
      //  "(1.0; 04/05/2021; 05/05/2021;);"
      let matches = /\([0-9.]+;/.exec(new_io[SDF.IO.BudgetSegments]);
      if (matches !== null) {
        new_io[SDF.IO.BudgetSegments] = 
          `${matches[0]} ${this.formatDateOnly(this.startDate!)}; ${this.formatDateOnly(this.endDate!)};);`
      }
    }

    if (tier) {
      var f = tmpl.getFrequency(isTrueView, tier);
      if (f) {
        new_io[SDF.IO.FrequencyEnabled] = 'TRUE';
        new_io[SDF.IO.FrequencyExposures] = f.exposures;
        new_io[SDF.IO.FrequencyPeriod] = f.period;
        new_io[SDF.IO.FrequencyAmount] = f.amount;
      } else {
        // TODO: what to do? Copy from template campaign probably
      }
    }

    this.setCustomFields(new_io, SdfElementType.IO, tierName, isTrueView ? 'YouTube' : 'Display', feedRow);
    return new_io;
  }

  private sdf_li(tmplLi: Record<string, string>, feedRow: Record<string, string>,
    tier: RuleInfo, tmpl: DV360Template, sourceAdGroups: number[], entryNum: number): Record<string, any> {
    let feedInfo = this.config.feedInfo!;
    let rowName = feedRow[feedInfo.name_column!];
    let tierName = tier.name;
    let isTrueView = tmplLi[SDF.LI.Type] == 'TrueView';

    let sourceIoId = tmplLi[SDF.LI.IoId];
    let ioPerTier = this.trueViewTmplIOs[sourceIoId] || tmpl.isDisplayIoPerTier();
    let ioKey = sourceIoId +
      (isTrueView || tmpl.isDisplayIoPerFeedRow() ? rowName : '') +
      (isTrueView || tmpl.isDisplayIoPerTier() ? tierName : '');

    let ioIndex = this.targetIoMap[ioKey];
    let liIndex = -1;
    if (ioIndex > -1) {
      // Updating IO (note: while updating this.currentSdf is not null)
      let key = this.currentSdf!.insertionOrders.get(SDF.LI.IoId, ioIndex) +
        tmplLi[SDF.LI.LineItemId] + rowName + tierName;
      liIndex = this.targetLiMap[key];
    }

    let new_li = _.clone(tmplLi);

    if (liIndex > -1) {
      // updating a LI
      let li_existing = this.currentSdf!.lineItems!.getRow(liIndex,
        SDF.LI.IoId, SDF.LI.LineItemId, SDF.LI.Timestamp, SDF.LI.Status);
      new_li[SDF.LI.IoId] = li_existing[SDF.LI.IoId];
      new_li[SDF.LI.LineItemId] = li_existing[SDF.LI.LineItemId];
      new_li[SDF.LI.Timestamp] = li_existing[SDF.LI.Timestamp];
      new_li[SDF.LI.Status] = this.fixDraft(li_existing[SDF.LI.Status]);
      this.sourceToDestLineItem[tmplLi[SDF.LI.LineItemId] + rowName + tierName] = liIndex;
      this.existingLisMap[li_existing[SDF.LI.LineItemId]] = true;
    }
    else {
      // creating a LI
      new_li[SDF.LI.LineItemId] = 'ext' + new_li[SDF.LI.LineItemId] + entryNum;
      if (ioIndex > -1)
        new_li[SDF.LI.IoId] = this.currentSdf!.insertionOrders.get(SDF.LI.IoId, ioIndex);
      else {
        new_li[SDF.LI.IoId] = this.resultIosMap[ioKey];
      }
    }

    if (this.recalculateStatus) {
      if (ioPerTier) {
        new_li[SDF.LI.Status] = 'Active';
      } else {
        new_li[SDF.LI.Status] = this.ruleEvaluator.getActiveRule(this.config.rules!, feedRow)?.name == tierName ? 'Active' : 'Paused';
      }
    }

    new_li[SDF.LI.Name] =
      tmpl.li_name(
        isTrueView,
        new_li[SDF.LI.Name],
        feedRow[feedInfo.name_column!],
        tierName);
    if (feedInfo.geo_code_column) {
      new_li[SDF.LI.GeographyTargeting_Include] = feedRow[feedInfo.geo_code_column];
    }
    new_li[SDF.LI.Details] =
      'source:' + tmplLi[SDF.LI.LineItemId] + '\n' +
      'city:' + rowName + '\n' +
      'tier:' + tierName;

    let frequency = tmpl.getFrequency(isTrueView, tier);

    if (!frequency) {
      // TODO: v2 new feature: copy frequency data from template campaign
    }
    else {
      if (!isTrueView) {
        // TODO: previously numbers were directly assigned, now it's strings, not sure it's correct
        new_li[SDF.LI.FrequencyEnabled] = 'TRUE';
        new_li[SDF.LI.FrequencyExposures] = frequency.exposures.toString();
        new_li[SDF.LI.FrequencyPeriod] = frequency.period;
        new_li[SDF.LI.FrequencyAmount] = frequency.amount.toString();

        let state = tier.display_state!;
        if (state.bid) {
          if (typeof state.bid == 'string' && state.bid[0] == 'x') {
            let mult = parseFloat(state.bid.substr(1));
            let bid = Number(new_li[SDF.LI.BidStrategyValue]) * mult;
            if (isNaN(bid)) {
              throw new Error(`Couldn't parse LI's bid value as number: ${new_li[SDF.LI.BidStrategyValue]}`);
            }
            // TODO: previously numbers were directly assigned, now it's strings, not sure it's correct
            new_li[SDF.LI.BidStrategyValue] = bid.toString();
          } else {
            new_li[SDF.LI.BidStrategyValue] = state.bid.toString();
          }
        }
        if (state.creatives) {
          let creatives = state.creatives.replace(/,/g,";").replace(/ */g, '');
          if (creatives[creatives.length-1] !== ";") creatives += ";";
          new_li[SDF.LI.CreativeAssignments] = creatives;
        }
        // if (state.creatives && state.creatives.length) {
        //   let creatives = state.creatives.length > 1
        //     ? (state.creatives.join(';') + ';').replace(/ */g, '')
        //     : state.creatives[0];
        //   new_li[SDF.LI.CreativeAssignments] = creatives;
        // }
      }
      else {
        // TrueView:
        // TODO: previously numbers were directly assigned, now it's strings, not sure it's correct
        new_li[SDF.LI.FrequencyEnabled] = 'TRUE';
        new_li[SDF.LI.FrequencyExposures] = frequency.exposures.toString();
        new_li[SDF.LI.FrequencyPeriod] = frequency.period;

        // NOTE: it was commented out in v1!
        //          newSdf.lineItems.set('TrueView View Frequency Enabled', -1, 'TRUE');
        //          newSdf.lineItems.set('TrueView View Frequency Exposures', -1, f.exposures);
        //          newSdf.lineItems.set('TrueView View Frequency Period', -1, f.period);

        let agDescr = [];
        for (const idx of sourceAdGroups) {
          agDescr.push('adgroup:' +
            tmpl.adgroup_name(
              this.tmplSdf.adGroups!.get('Name', idx), rowName, tierName)
            + ':' + this.tmplSdf.adGroups!.get('Ad Group Id', idx));
        }
        new_li[SDF.LI.Details] = new_li[SDF.LI.Details] + '\n' + agDescr.join('\n');

      }
    }

    this.setCustomFields(new_li, SdfElementType.LI, tierName, isTrueView ? 'YouTube' : 'Display', feedRow);
    return new_li;
  }

  private sdf_adgroup(tmplAg: Record<string, string>, feedRow: Record<string, string>,
    tier: RuleInfo, tmpl: DV360Template, entryNum: number): Record<string, any> {
    let feedInfo = this.config.feedInfo!;
    let rowName = feedRow[feedInfo.name_column!];
    let tierName = tier.name;

    let liIndex = this.sourceToDestLineItem[tmplAg[SDF.AdGroup.LineItemId] + rowName + tierName];
    let agIndex = -1;
    if (liIndex > -1) {
      let details = this.currentSdf!.lineItems!.get(SDF.LI.Details, liIndex);
      let allAgsIndex = this.currentSdf!.adGroups!.findAll(SDF.LI.LineItemId, this.currentSdf!.lineItems!.get(SDF.LI.LineItemId, liIndex));
      let re = /adgroup:(.+?):(\d+)(?:\n|$)/gm;
      let matches;
      while (matches = re.exec(details)) {
        for (let idx of allAgsIndex) {
          if (this.currentSdf!.adGroups!.get(SDF.AdGroup.Name, idx) == matches[1] &&
            tmplAg[SDF.AdGroup.AdGroupId] == matches[2]) {
            agIndex = idx;
            break;
          }
        }
        if (agIndex > -1) break;
      }
    }

    let new_adgroup = _.clone(tmplAg);

    if (agIndex > -1) {
      let cur_adgroup = this.currentSdf!.adGroups!.getRow(agIndex);
      new_adgroup[SDF.AdGroup.LineItemId] = cur_adgroup[SDF.AdGroup.LineItemId];
      new_adgroup[SDF.AdGroup.AdGroupId] = cur_adgroup[SDF.AdGroup.AdGroupId];
      new_adgroup[SDF.AdGroup.Status] = this.fixDraft(cur_adgroup[SDF.AdGroup.Status]);
      this.sourceToDestAdGroup[tmplAg[SDF.AdGroup.AdGroupId] + rowName + tierName] = agIndex;
      this.existingAdGroupsMap[cur_adgroup[SDF.AdGroup.AdGroupId]] = true;
    }
    else {
      new_adgroup[SDF.AdGroup.AdGroupId] = 'ext' + new_adgroup[SDF.AdGroup.AdGroupId] + entryNum;
      if (liIndex > -1)
        new_adgroup[SDF.AdGroup.LineItemId] = this.currentSdf!.lineItems!.get(SDF.AdGroup.LineItemId, liIndex);
      else
        new_adgroup[SDF.AdGroup.LineItemId] = 'ext' + new_adgroup[SDF.AdGroup.LineItemId] + entryNum;
    }

    if (this.recalculateStatus) {
      new_adgroup[SDF.AdGroup.Status] = 'Active';
    }

    new_adgroup[SDF.AdGroup.Name] = tmpl.adgroup_name(new_adgroup[SDF.AdGroup.Name], rowName, tierName);
    if (tier.youtube_state && tier.youtube_state.bid)
      new_adgroup[SDF.AdGroup.MaxCost] = tier.youtube_state.bid.toString();

    this.setCustomFields(new_adgroup, SdfElementType.AdGroup, tierName, 'YouTube', feedRow);
    return new_adgroup;
  }

  private sdf_ad(tmplAd: Record<string, string>, feedRow: Record<string, string>,
    rule: RuleInfo, tmpl: DV360Template, entryNum: number): Record<string, string> {
    var feedInfo = this.config.feedInfo!;
    var rowName = feedRow[feedInfo.name_column!];
    var ruleName = rule.name;
    if (!rule.youtube_state || !rule.youtube_state.creatives)
      throw new Error(`[SdfGenerator] State configuration ${ruleName} doesn\'t have an TrueView creative`);
    if (rule.youtube_state.creatives.indexOf(',') > 1 || rule.youtube_state.creatives.indexOf(';') > 1)
      throw new Error(`[SdfGenerator] State configuration ${ruleName} has more than 1 TrueView creatives which is not allowed`);

    var agIndex = this.sourceToDestAdGroup[tmplAd[SDF.Ad.AdGroupId] + rowName + ruleName];
    var adIndex = -1;
    if (agIndex > -1) {
      var allAdIndexes = this.currentSdf!.ads!.findAll(SDF.Ad.AdGroupId, this.currentSdf!.adGroups!.get(SDF.Ad.AdGroupId, agIndex));
      for (let idx of allAdIndexes) {
        if (this.currentSdf!.ads!.get(SDF.Ad.VideoId, idx) == rule.youtube_state.creatives) {
          adIndex = idx;
          break;
        }
      }
    }

    let new_ad = _.clone(tmplAd);

    if (adIndex > -1) {
      let cur_ad = this.currentSdf!.ads!.getRow(adIndex, SDF.Ad.AdGroupId, SDF.Ad.AdId, SDF.Ad.Status);
      new_ad[SDF.Ad.AdGroupId] = cur_ad[SDF.Ad.AdGroupId];
      new_ad[SDF.Ad.AdId] = cur_ad[SDF.Ad.AdId];
      new_ad[SDF.Ad.Status] = this.fixDraft(cur_ad[SDF.Ad.Status]);
      this.existingAdsMap[cur_ad[SDF.Ad.AdId]] = true;
    }
    else {
      new_ad[SDF.Ad.AdId] = 'ext' + new_ad[SDF.Ad.AdId] + entryNum;
      if (agIndex > -1)
        new_ad[SDF.Ad.AdGroupId] = this.currentSdf!.adGroups!.get(SDF.Ad.AdGroupId, agIndex);
      else
        new_ad[SDF.Ad.AdGroupId] = 'ext' + new_ad[SDF.Ad.AdGroupId] + entryNum;
    }
    if (this.recalculateStatus) {
      new_ad[SDF.Ad.Status] = 'Active';
    }
    new_ad[SDF.Ad.Name] = tmpl.ad_name(new_ad[SDF.Ad.Name], rowName, ruleName);
    new_ad[SDF.Ad.VideoId] = rule.youtube_state.creatives;

    this.setCustomFields(new_ad, SdfElementType.Ad, ruleName, 'YouTube', feedRow);
    return new_ad;
  }

  /** Formats a date in SDF format for date: MM/DD/YYYY HH:mm */
  formatDateOnly(date: Date): string {
    // MM/DD/YYYY HH:mm
    // e.g.: 04/05/2021 00:00
    let month = date.getMonth() + 1;
    let day = date.getDate();
    let year = date.getFullYear();
    return (month <= 9 ? "0" : "") + month.toString() + "/" + 
      (day <=9 ? "0" : "") + `${day}/${year}`
  }

  formatDate(date: Date): string {
    return this.formatDateOnly(date) + " 00:00";
  }
}
