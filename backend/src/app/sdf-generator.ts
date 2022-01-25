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
import _ from 'lodash';
import { Config, DV360TemplateInfo, FrequencyPeriod, RuleInfo, SdfElementType, TemplateMacros, SDF, RuleState } from '../types/config';
import { RuleEvaluator } from './rule-engine';
import { FeedData, SdfFull } from '../types/types';
import { Logger } from '../types/logger';

type FrequencyInfo = {
  exposures: number,
  period: string,
  amount: number
};
class DV360Template {
  info: DV360TemplateInfo;

  constructor(template: DV360TemplateInfo) {
    if (!template)
      throw new Error();

    this.info = template;
  }

  private generate(tmpl: string, base: string, rowName: string, ruleName: string) {
    if (!tmpl) { return '';}
    return tmpl
      .replace(/{base_name}/, base)
      .replace(/{row_name}/, rowName)
      .replace(/{rule_name}/, ruleName) // NOTE: in v1 it was tier_name
      .trim();
  }

  /**
   * Whather Display IO's template contains row_name (a unique label per data feed's row)
   */
  isDisplayIoPerFeedRow(): boolean {
    return this.info.io_template?.indexOf(TemplateMacros.row_name) != -1;
  }

  /**
   * Whather Display IO's template contains rule_name
   */
  isDisplayIoPerRule(): boolean {
    return this.info.io_template?.indexOf(TemplateMacros.rule_name) != -1;
  }

  /**
   * Generate an IO name.
   * @param base IO base name
   * @param rowName A row label
   * @param ruleName A rule name
   */
  io_name(isTrueView: boolean, base: string, rowName: string, ruleName: string) {
    // NOTE: for assertion - we have checked nullability in constructor
    return this.generate(
      <string>(isTrueView ? this.info.yt_io_template : this.info.io_template),
      base, rowName, ruleName);
  }

  /**
   * Generate a LI name.
   * @param base LI base
   * @param rowName A row label
   * @param ruleName A rule name
   */
  li_name(isTrueView: boolean, base: string, rowName: string, ruleName: string) {
    // NOTE: for assertion - we have checked nullability in constructor
    return this.generate(
      <string>(isTrueView ? this.info.yt_li_template : this.info.li_template),
      base, rowName, ruleName);
  }

  /**
   * Generate an AdGroup name.
   * @param base adgroup base
   * @param rowName A row label
   * @param ruleName A rule name
   */
  adgroup_name(base: string, rowName: string, ruleName: string) {
    // NOTE: for assertion - you have checked nullability in constructor
    return this.generate(<string>this.info.adgroup_template, base, rowName, ruleName);
  }

  /**
   * Generate an Ad name.
   * @param base ad base name
   * @param rowName A row label
   * @param ruleName A rule name
   */
  ad_name(base: string, rowName: string, ruleName: string) {
    // NOTE: for assertion - you have checked nullability in constructor
    return this.generate(<string>this.info.ad_template, base, rowName, ruleName);
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
  /**
   * A mapping of a composite key (sourceId + rowName + ruleName) to IO's index in currentSdf.insertionOrders,
   * i.e. a map to find an exising IO (while updating) by template IO's id, row and rule.
   */
  targetIoMap: Record<string, number> = {};
  /**
   * A mapping of a composite key (IoId + sourceId + rowName + ruleName) to LI's index in currentSdf.lineItems,
   * i.e. a map to find an exising LI (while updating) by IO's id, template LI's id, row and rule.
   */
  targetLiMap: Record<string, number> = {};
  /**
   * A mapping of IO Ids from template campaing to IsTrueView flag.
   */
  trueViewTmplIOs: Record<string, boolean> = {};
  /**
   * A list (actually mapping to true) of existing IOs' ids that we're going to activate
   * (ids are from currentSdf.insertionOrders).
   * So that all other IOs (absent in this map) will be archived.
   */
  existingIosMap: Record<string, boolean> = {};
  /**
   * A list (actually mapping to true) of existing LIs' ids that we're going to activate
   * (ids are from currentSdf.lineItems).
   * So that all other LIs (absent in this map) will be archived.
   */
  existingLisMap: Record<string, boolean> = {};
  existingAdGroupsMap: Record<string, boolean> = {};
  existingAdsMap: Record<string, boolean> = {};
  /**
   * A mapping for IOs of a composite key (template IO's id + rowName + ruleName)
   * to a new IO's id in a campaing being generated.
   */
  resultIosMap: Record<string, string> = {};
  /**
   * A mapping of keys consisting of template's 'Line Item Id' + rowName + ruleName (rule)
   * to LI's indecies in `currentSdf.lineItems` (existing LI)
   */
  sourceToDestLineItem: Record<string, number> = {};
  /**
   * A mapping of key consusting of template's AdGroupId + rowName + ruleName
   * to AdGroup indecies in `currentSdf.adGroups` (existing AdGroup)
   */
  sourceToDestAdGroup: Record<string, number> = {};
  recalculateStatus = false;
  /** Whether to make new campaign active or not */
  autoActivate = false;
  /** Start date for new campaign */
  startDate?: Date;
  /** End date for new campaign */
  endDate?: Date;

  constructor(private config: Config,
    private logger: Logger,
    private ruleEvaluator: RuleEvaluator,
    private feedData: FeedData,
    private tmplSdf: SdfFull,
    private currentSdf: SdfFull | null) {
    if (!logger) throw new Error('[SdfGenerator] ArgumentException: Required argument logger is missing');
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
    // NOTE: we assume that config has been validated already (via ConfigValidator)
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
        SDF.Campaign.Name, SDF.Campaign.CampaignId, SDF.Campaign.Timestamp, SDF.Campaign.Status,
        SDF.Campaign.CampaignStartDate, SDF.Campaign.CampaignEndDate);
      this.logger.log('debug', `[SdfGenerator] Updating campaign ${campaignId}`, {campaing: new_campaign});
      if (!currentSdf.insertionOrders || currentSdf.insertionOrders.rowCount == 0) {
        throw new Error(`[SdfGenerator] Campaign ${campaignId} that's beign updated doesn't contain Insertion Orders`);
      }
    } else {
      // generating new
      currentSdf = null;
      if (!dv360Template.campaign_name)
        throw new Error(`[SdfGenerator] New campaign name is not specified in configuration`);
      campaignId = 'ext' + tmplSdf.campaigns.get(SDF.Campaign.CampaignId, -1);
      new_campaign = {
        [SDF.Campaign.Name]: dv360Template.campaign_name,
        [SDF.Campaign.CampaignId]: campaignId
      }
      this.logger.log('debug', `[SdfGenerator] Generating a new campaign ${campaignId}`, {campaing: new_campaign});
    }
    if (this.autoActivate) {
      new_campaign[SDF.Campaign.Status] = 'Active';
    }
    if (this.startDate) {
      if (currentSdf != null) {
        // if we're updating and campaign's start date in the past, there's no point to change it
        // as it'll cause an import error: "The campaign has already started. The start date cannot be modified."
        // format: MM/DD/YYYY
        let dtCurrent = Date.parse(new_campaign[SDF.Campaign.CampaignStartDate]);
        if (dtCurrent >= Date.now()) {
          new_campaign[SDF.Campaign.CampaignStartDate] = this.formatDate(this.startDate);
        }
      } else {
        new_campaign[SDF.Campaign.CampaignStartDate] = this.formatDate(this.startDate);
      }
    }
    if (this.endDate) {
      new_campaign[SDF.Campaign.CampaignEndDate] = this.formatDate(this.endDate);
    }
    // TODO: support custom fields for campaigns

    this.recalculateStatus = new_campaign[SDF.Campaign.Status] == 'Active';

    // template campaign can be empty, or contains only IOs, or IOs and LIs, or IOs/LIs and AdGroups (for TrueView only)
    // The only requirement is existence of IOs
    if (!tmplSdf.insertionOrders || tmplSdf.insertionOrders.rowCount == 0) {
      throw new Error(`[SdfGenerator] Template campaign ${tmplSdf.campaigns.get(SDF.Campaign.CampaignId, -1)} doesn't contain Insertion Orders`);
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
      // NOTE: we checked above that currentSdf.insertionOrders isn't empty
      for (let i = 0; i < currentSdf.insertionOrders.rowCount; i++) {
        let details = currentSdf.insertionOrders.get(SDF.IO.Details, i);
        let source: any = /source:(\d+)(?:\\n|$)/m.exec(details);
        let rowName: any = /row:(.+?)(?:\\n|$)/m.exec(details);
        let ruleName: any = /rule:(.+?)(?:\\n|$)/m.exec(details);

        source = source && source[1].trim();
        rowName = (rowName && rowName[1].trim()) || '';
        ruleName = (ruleName && ruleName[1].trim()) || '';

        if (source) {
          this.targetIoMap[<string>(source + rowName + ruleName)] = i;
        }
      }
      if (currentSdf.lineItems) {
        for (let i = 0; i < currentSdf.lineItems.rowCount; i++) {
          let details = currentSdf.lineItems.get(SDF.LI.Details, i);
          let source: any = /source:(\d+)/.exec(details);
          let rowName: any = /row:(.+?)(?:\\n|$)/m.exec(details);
          let ruleName: any = /rule:(.+?)(?:\\n|$)/m.exec(details);

          source = source && source[1].trim();
          rowName = (rowName && rowName[1].trim()) || '';
          ruleName = (ruleName && ruleName[1].trim()) || '';

          if (source && rowName && ruleName) {
            this.targetLiMap[currentSdf.lineItems.get(SDF.LI.IoId, i) +
              source + rowName + ruleName] = i;
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
        if (tmpl.isDisplayIoPerRule()) {
          // IO doesn't depend on feed row but depends on rules
          // it's not allowed configuration!
        } else {
          // IO doesn't depend on anything (neither feed row nor rules)
          let new_io = this.sdf_io(isTrueViewIO, campaignId, tmplIo, null, null, tmpl, no);
          newSdf.insertionOrders.addRow(new_io);
        }
      } else {
        // IO depends on feed row (contains row_name in name template) or it's TrueView IO (and so must depend on feed row)
        for (let i = 0; i < this.feedData.rowCount; i++) {
          let feedRow = this.feedData.getRow(i);
          if (isTrueViewIO || tmpl.isDisplayIoPerRule()) {
            // IO depends on rules (either TrV IO or IO's name contains rule_name) and feed row
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
            // TODO: in v1 we didn't create LIs if a rule's frequesncy was empty:
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
            let new_ads = this.sdf_ad(tmplAd, feedRow, rule, tmpl, no);
            for (const ad of new_ads) {
              newSdf.ads!.addRow(ad);
            }
            // NOTE: the numbering should be done in the same way as for AdGroups above
            // (because a number in sdf_ad is used for referencing to an adgroup)
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

  private setCustomFields(row: Record<string, string>, sdfType: SdfElementType, ruleName: string,
    media: 'YouTube' | 'Display' | null, feedRow: Record<string, string> | null) {
    if (!this.config.customFields)
      return;
    for (const cf of this.config.customFields) {
      if ((cf.rule_name == 'All' || cf.rule_name == ruleName)
        && cf.sdf_type == sdfType
        && (!media || media && cf.media == media || cf.media == '')) {
        let value = cf.value;
        if (feedRow && value) {
          // try to parse value as expression
          value = this.ruleEvaluator.evaluateExpression(value, feedRow);
          if (value == null) {
            this.logger.warn(`CustomFields' expression '${value}' was evaluated to ${value}`);
          }
        }
        if (value !== null && value !== undefined && value !== '' && <any>value !== NaN) {
          row[cf.sdf_field] = value;
        }
      }
    }
  }

  private sdf_io(isTrueView: boolean, campaignId: string, tmplIo: Record<string, any>, feedRow: Record<string, string> | null,
    rule: RuleInfo | null, tmpl: DV360Template, entryNum: number): Record<string, any> {
    let feedInfo = this.config.feedInfo!;
    let rowName = feedRow ? feedRow[feedInfo.name_column!] : '';
    let ruleName = rule ? rule.name : '';

    let sourceId = tmplIo[SDF.IO.IoId];
    let key = sourceId + rowName + ruleName;
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
      if (rule)
        new_io[SDF.IO.Status] = this.ruleEvaluator.getActiveRule(this.config.rules!, feedRow!)?.name == ruleName ? 'Active' : 'Paused';
      else
        new_io[SDF.IO.Status] = 'Active';
    }

    new_io[SDF.IO.Name] = tmpl.io_name(isTrueView, new_io[SDF.IO.Name], rowName, ruleName);
    new_io[SDF.IO.Details] = 'source:' + sourceId + '\n' +
      'row:' + rowName + '\n' +
      'rule:' + ruleName;

    this.resultIosMap[key] = new_io[SDF.IO.IoId];

    let budget;
    if (tmpl.info.total_budget) {
      if (feedRow) {
        if (feedInfo.budget_factor_column) {
          budget = tmpl.info.total_budget * Number(feedRow[feedInfo.budget_factor_column]);
        } else {
          // NOTE: in v1 it was: total_budget/(rowCount-1)
          budget = tmpl.info.total_budget / this.feedData.rowCount;
        }
      } else {
        budget = tmpl.info.total_budget;
      }
      if (_.isFinite(budget)) {
        new_io[SDF.IO.BudgetSegments] = new_io[SDF.IO.BudgetSegments].replace(/\([0-9.]+;/, '(' + budget + ';');
      }
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

    if (rule) {
      var f = tmpl.getFrequency(isTrueView, rule);
      if (f) {
        new_io[SDF.IO.FrequencyEnabled] = 'TRUE';
        new_io[SDF.IO.FrequencyExposures] = f.exposures;
        new_io[SDF.IO.FrequencyPeriod] = f.period;
        new_io[SDF.IO.FrequencyAmount] = f.amount;
      } else {
        // TODO: what to do? Copy from template campaign probably
      }
    }

    this.setCustomFields(new_io, SdfElementType.IO, ruleName, isTrueView ? 'YouTube' : 'Display', feedRow);
    return new_io;
  }

  private sdf_li(tmplLi: Record<string, string>, feedRow: Record<string, string>,
    rule: RuleInfo, tmpl: DV360Template, sourceAdGroups: number[], entryNum: number): Record<string, any> {
    let feedInfo = this.config.feedInfo!;
    let rowName = feedRow[feedInfo.name_column!];
    let ruleName = rule.name;
    let isTrueView = tmplLi[SDF.LI.Type] == 'TrueView';

    let sourceIoId = tmplLi[SDF.LI.IoId];
    let ioPerRule = this.trueViewTmplIOs[sourceIoId] || tmpl.isDisplayIoPerRule();
    let ioKey = sourceIoId +
      (isTrueView || tmpl.isDisplayIoPerFeedRow() ? rowName : '') +
      (isTrueView || tmpl.isDisplayIoPerRule() ? ruleName : '');

    let ioIndex = this.targetIoMap[ioKey];
    let liIndex = -1;
    if (ioIndex > -1) {
      // Updating IO (note: while updating this.currentSdf is not null)
      let key = this.currentSdf!.insertionOrders.get(SDF.LI.IoId, ioIndex) +
        tmplLi[SDF.LI.LineItemId] + rowName + ruleName;
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
      this.sourceToDestLineItem[tmplLi[SDF.LI.LineItemId] + rowName + ruleName] = liIndex;
      this.existingLisMap[li_existing[SDF.LI.LineItemId]] = true;
    }
    else {
      // creating a LI
      new_li[SDF.LI.LineItemId] = 'ext' + new_li[SDF.LI.LineItemId] + entryNum;
      if (ioIndex > -1) {
        new_li[SDF.LI.IoId] = this.currentSdf!.insertionOrders.get(SDF.LI.IoId, ioIndex);
      } else {
        new_li[SDF.LI.IoId] = this.resultIosMap[ioKey];
      }
    }

    if (this.recalculateStatus) {
      if (ioPerRule) {
        new_li[SDF.LI.Status] = 'Active';
      } else {
        new_li[SDF.LI.Status] = this.ruleEvaluator.getActiveRule(this.config.rules!, feedRow)?.name == ruleName ? 'Active' : 'Paused';
      }
    }

    new_li[SDF.LI.Name] =
      tmpl.li_name(
        isTrueView,
        new_li[SDF.LI.Name],
        feedRow[feedInfo.name_column!],
        ruleName);
    // set LI's geo-targeting
    if (feedInfo.geo_code_column) {
      const geo_code = feedRow[feedInfo.geo_code_column];
      if (_.isInteger(+geo_code)) {
        new_li[SDF.LI.GeographyTargeting_Include] = geo_code;
      }
      else if (geo_code.includes(';')) {
        const res = _.every(geo_code.split(';'), (val) => {
          return _.isInteger(+val);
        });
        if (res) {
          new_li[SDF.LI.GeographyTargeting_Include] = `(${geo_code})`;
        }
        else {
          this.logger.warn(`[SdfGenerator] Ignoring geo code '${geo_code}' for LI '${new_li[SDF.LI.Name]}', only numbers or lists of numbers (with ';' as separator) are supported`);
        }
      }
      else {
        this.logger.warn(`[SdfGenerator] Ignoring non-integer geo code '${geo_code}' for LI '${new_li[SDF.LI.Name]}'`);
      }
    }
    // set in LI's Details field some meta-info that allows us to correlate later the LI and row/rule
    new_li[SDF.LI.Details] =
      'source:' + tmplLi[SDF.LI.LineItemId] + '\n' +
      'row:' + rowName + '\n' +
      'rule:' + ruleName;

    let frequency = tmpl.getFrequency(isTrueView, rule);

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

        let state = rule.display_state!;
        if (state.bid) {
          new_li[SDF.LI.BidStrategyValue] = this.getBidValue(state.bid, new_li[SDF.LI.BidStrategyValue]);
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

        // NOTE: bid and creative will be set in agroup/ad

        // NOTE: it was commented out in v1!
        //          newSdf.lineItems.set('TrueView View Frequency Enabled', -1, 'TRUE');
        //          newSdf.lineItems.set('TrueView View Frequency Exposures', -1, f.exposures);
        //          newSdf.lineItems.set('TrueView View Frequency Period', -1, f.period);

        let agDescr = [];
        for (const idx of sourceAdGroups) {
          agDescr.push('adgroup:' +
            tmpl.adgroup_name(
              this.tmplSdf.adGroups!.get('Name', idx), rowName, ruleName)
            + ':' + this.tmplSdf.adGroups!.get('Ad Group Id', idx));
        }
        new_li[SDF.LI.Details] = new_li[SDF.LI.Details] + '\n' + agDescr.join('\n');

      }
    }

    this.setCustomFields(new_li, SdfElementType.LI, ruleName, isTrueView ? 'YouTube' : 'Display', feedRow);
    return new_li;
  }

  private getBidValue(bid: any, tmplValue: string): string {
    if (typeof bid == 'string' && bid[0] == 'x') {
      let mult = parseFloat(bid.substr(1));
      bid = Number(tmplValue) * mult;
      if (isNaN(bid)) {
        throw new Error(`Couldn't parse LI's bid value as number: ${tmplValue}`);
      }
    }
    // TODO: previously numbers were directly assigned, now it's strings, not sure it's correct
    return bid.toString();
  }

  private sdf_adgroup(tmplAg: Record<string, string>, feedRow: Record<string, string>,
    rule: RuleInfo, tmpl: DV360Template, entryNum: number): Record<string, any> {
    let feedInfo = this.config.feedInfo!;
    let rowName = feedRow[feedInfo.name_column!];
    let ruleName = rule.name;

    let liIndex = this.sourceToDestLineItem[tmplAg[SDF.AdGroup.LineItemId] + rowName + ruleName];
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
      this.sourceToDestAdGroup[tmplAg[SDF.AdGroup.AdGroupId] + rowName + ruleName] = agIndex;
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

    new_adgroup[SDF.AdGroup.Name] = tmpl.adgroup_name(new_adgroup[SDF.AdGroup.Name], rowName, ruleName);
    // Bid
    if (rule.youtube_state && rule.youtube_state.bid) {
      new_adgroup[SDF.AdGroup.BidCost] = this.getBidValue(rule.youtube_state.bid, new_adgroup[SDF.AdGroup.BidCost]);
    }

    this.setCustomFields(new_adgroup, SdfElementType.AdGroup, ruleName, 'YouTube', feedRow);
    return new_adgroup;
  }

  private sdf_ad(tmplAd: Record<string, string>, feedRow: Record<string, string>,
    rule: RuleInfo, tmpl: DV360Template, entryNum: number): Record<string, string>[] {
    var feedInfo = this.config.feedInfo!;
    var rowName = feedRow[feedInfo.name_column!];
    var ruleName = rule.name;
    if (!rule.youtube_state || !rule.youtube_state.creatives)
      throw new Error(`[SdfGenerator] Rule "${ruleName}" doesn't have a TrueView creative`);
    // We support multiple creatives in YT-rule,
    // so in such a case we need to create an Ad per each video id
    // At the same time entryNum is an index of AdGroup should it shouldn't change and used for all Ads of same AdGroups
    let new_ads = [];
    let creatives = rule.youtube_state.creatives.split(/[,;]/);
    let creative_idx = -1;
    for (const videoId of creatives) {
      creative_idx++;
      // we should either create a new Ad for each rule's creative or find an existing one in currentSdf!.ads
      let adIndex = -1; // an existing Ad index
      let agIndex = this.sourceToDestAdGroup[tmplAd[SDF.Ad.AdGroupId] + rowName + ruleName];
      if (agIndex > -1) {
        // find all Ads in currentSdf that belong to an AdGroup with id at agIndex index
        let allAdIndexes = this.currentSdf!.ads!.findAll(SDF.Ad.AdGroupId, this.currentSdf!.adGroups!.get(SDF.Ad.AdGroupId, agIndex));
        for (let idx of allAdIndexes) {
          if (this.currentSdf!.ads!.get(SDF.Ad.VideoId, idx) == videoId) {
            adIndex = idx;
            break;
          }
        }
      }
      let new_ad = _.clone(tmplAd);

      if (adIndex > -1) {
        // updating an existing Ad
        let cur_ad = this.currentSdf!.ads!.getRow(adIndex, SDF.Ad.AdGroupId, SDF.Ad.AdId, SDF.Ad.Status);
        new_ad[SDF.Ad.AdGroupId] = cur_ad[SDF.Ad.AdGroupId];
        new_ad[SDF.Ad.AdId] = cur_ad[SDF.Ad.AdId];
        new_ad[SDF.Ad.Status] = this.fixDraft(cur_ad[SDF.Ad.Status]);
        this.existingAdsMap[cur_ad[SDF.Ad.AdId]] = true;
      }
      else {
        // creating a new Ad
        new_ad[SDF.Ad.AdId] = 'ext' + new_ad[SDF.Ad.AdId] + entryNum + creative_idx;
        // find an existing parent AdGroup or refer to a newly created one
        if (agIndex > -1) {
          new_ad[SDF.Ad.AdGroupId] = this.currentSdf!.adGroups!.get(SDF.Ad.AdGroupId, agIndex);
        }
        else {
          new_ad[SDF.Ad.AdGroupId] = 'ext' + new_ad[SDF.Ad.AdGroupId] + entryNum;
        }
      }
      if (this.recalculateStatus) {
        new_ad[SDF.Ad.Status] = 'Active';
      }
      new_ad[SDF.Ad.Name] = tmpl.ad_name(new_ad[SDF.Ad.Name], rowName, ruleName);
      new_ad[SDF.Ad.VideoId] = videoId;

      this.setCustomFields(new_ad, SdfElementType.Ad, ruleName, 'YouTube', feedRow);
      new_ads.push(new_ad);
    }
    return new_ads;
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
