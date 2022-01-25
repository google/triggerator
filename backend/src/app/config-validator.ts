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
import { Config, DV360TemplateInfo, FeedConfig, RuleInfo, TemplateMacros } from "../types/config";
import { FeedData } from "../types/types";

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

export default class ConfigValidator {
  private static validateConfigurationBase(config: Config): ValidationError[] {
    if (!config.execution)
      throw new Error(`[validateConfiguration] config.execution section is missing`);
    if (!config.dv360Template)
      throw new Error(`[validateConfiguration] Config object doesn't have dv360Template section`);
    if (!config.feedInfo)
      throw new Error(`[validateConfiguration] Feeds are missing`);
    if (!config.rules)
      throw new Error(`[validateConfiguration] Rules are missing`);

    let errors: ValidationError[] = this.validateFeeds(config.feedInfo);
    if (!config.execution.advertiserId)
      errors.push({ message: 'Advertiser id is not specified' });
    combineErrors(errors,
      this.validateRules(config.rules));

    return errors;
  }

  static validateFeeds(feedInfo: FeedConfig): ValidationError[] {
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
          errors.push({ message: `The '${feed.name}' feed's url is not specified` });
        // TODO: key_columns задана если больше 2
        if (!feed.type)
          errors.push({ message: `The '${feed.name}' feed's type is not specified` });
        if (feed.external_key) {
          let ext_feed_name = feed.external_key.substring(0, feed.external_key.indexOf("."));
          let ext_feed = feedInfo.feeds.find(f => f.name === ext_feed_name);
          if (!ext_feed) {
            errors.push({ message: `The '${feed.name}' feed refers to unknown feed by external key ${ext_feed_name}` });
          } else if (ext_feed.name === feed.name) {
            errors.push({ message: `The '${feed.name}' feed refers to itself by its external key` });
          }
          // if a feed has a external_key, it must have a key
          if (!feed.key_column) {
            errors.push({ message: `The '${feed.name}' feed has an external key but has no key column` });
          }
        }
      }
      if (feedInfo.feeds.length > 1 && feedInfo.feeds.filter(f => !f.external_key).length > 1) {
        // there can be only one feed without external_key
        errors.push({ message: `Found several feeds without external key` });
      }
      if (feedInfo.feeds.length > 1 && feedInfo.feeds.filter(f => !f.external_key).length == 0) {
        errors.push({ message: `Among several feeds there should be one and only one without external key` });
      }
      // TODO: ссылки ключами не образуют циклов (надо построить граф)
    }
    return errors;
  }

  static validateRules(rules: RuleInfo[]): ValidationError[] {
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

  static validateTemplates(templ: DV360TemplateInfo): ValidationError[] {
    let errors: ValidationError[] = [];
    if (templ.io_template && templ.li_template) {
      // the only combinations allows are:
      // 1. IO depends on row and rule
      // 2. IO depends on row
      // 3. IO depends on nothing
      let io_templ = templ.io_template || '';
      let li_templ = templ.li_template || '';
      if (io_templ.includes(TemplateMacros.rule_name) && !io_templ.includes(TemplateMacros.row_name)) {
        errors.push({
          message: `Template for IO contains rule_name macro without row_name`
        });
      }
      // If IO doesn't depend on rule then LI must depend on rule
      if (io_templ.includes(TemplateMacros.row_name) && !io_templ.includes(TemplateMacros.rule_name) && !li_templ.includes(TemplateMacros.rule_name)) {
        errors.push({
          message: `If IO template doesn't depend on rule (no rule_name macro) then LI template must depend on rule but it doesn't`
        });
      }
      // If IO depends on nothing then LI must depend on rule and row
      if (!io_templ.includes(TemplateMacros.row_name) && !io_templ.includes(TemplateMacros.rule_name)) {
        errors.push({
          message: `If IO template depend on nothing (no rule_name/row_name macros) then LI template must depend on row and rule but it doesn't`
        });
      }
    }

    // TrueVuew IO must depend on row and rule always
    if (templ.yt_io_template) {
      if (!templ.yt_io_template.includes(TemplateMacros.row_name) || !templ.yt_io_template.includes(TemplateMacros.rule_name)) {
        errors.push({
          message: `TrueView IO template always must depend on row and rule (has rule_name/row_name macros) but it doesn't`
        });
      }
    }
    return errors;
  }

  /**
   * Validate a configuration for generating SDF with new/updated campaign.
   * @param config Configuration to validate
   * @param update true if updating an existing campaign or false if generating a new one
   * @returns ValidationError[]
   */
  static validateGeneratingConfiguration(config: Config, update: boolean): ValidationError[] {
    let errors = this.validateConfigurationBase(config);
    if (!config.dv360Template!.template_campaign)
      throw new Error(`[validateConfiguration] Template DV360 campaign id is missing in configuration`);
    if (update && !config.execution!.campaignId)
      throw new Error(`[validateConfiguration] Existing DV360 campaign id is missing in configuration`);

    combineErrors(errors,
        this.validateTemplates(config.dv360Template!));

    return errors;
  }

  static validateGeneratingRuntimeConfiguration(config: Config, feed: FeedData): ValidationError[] {
    // NOTE: it's supposed that validateGeneratingConfiguration was already called and feed is not empty
    let errors: ValidationError[] = [];
    let row = feed.getRow(0);
    const feedInfo = config.feedInfo!;
    if (!this.validateColumn(row, feedInfo.name_column!)) {
      errors.push({message:  `Row name column '${feedInfo.name_column}' was not found in feed data`});
    }
    if (feedInfo.geo_code_column) {
      if (!this.validateColumn(row, feedInfo.geo_code_column)) {
        errors.push({message:  `Geo code column '${feedInfo.geo_code_column}' was not found in feed data`});
      }
    }
    if (feedInfo.budget_factor_column) {
      if (!this.validateColumn(row, feedInfo.budget_factor_column)) {
        errors.push({message:  `Budget factor column '${feedInfo.budget_factor_column}' was not found in feed data`});
      }
    }
    return errors;
  }

  private static validateColumn(object: any, path: string): boolean {
    const parts = path.split('.');
    for(let i=0; i < parts.length - 1; i++) {
      object = object[parts[i]];
      if (!object) return false;
    }
    if (!object) return false;
    return object.hasOwnProperty(parts[parts.length-1]);
  }

  /**
   * Validate a configuration for main execution
   * @param config Configuration to validate
   * @returns ValidationError[]
   */
  static validateRuntimeConfiguration(config: Config): ValidationError[] {
    let errors = this.validateConfigurationBase(config);
    if (!config.execution!.campaignId)
      errors.push({ message: 'Campaign id is not specified' });

    return errors;
  }

}