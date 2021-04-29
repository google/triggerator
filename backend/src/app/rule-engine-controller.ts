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
import { Config } from '../types/config';
import ConfigService from './config-service';
import FeedService from './feed-service';
import RuleEngine, { RuleEvaluator } from './rule-engine';
import DV360Facade from './dv360-facade';
import {sendEmail} from './email-notifier';

export interface ProcessingOptions {
  sendNotifications: boolean
}
export default class RuleEngineController {
  constructor(private configService: ConfigService, 
    private ruleEvaluator: RuleEvaluator,
    private feedService: FeedService, 
    private dv_facade: DV360Facade) {
  }

  async run(configSpreadsheetId: string, options: ProcessingOptions) {
    options = options || {};
    if (!configSpreadsheetId) throw new Error(`[RuleEngineController] Configuration was not specified`);
    // NOTE: we can't handle errors in loadConfigration because w/o Config we can't send notifications
    let config = await this.configService.loadConfiguration(configSpreadsheetId);
    try {
      let errors = this.configService.validateRuntimeConfiguration(config);
      if (errors && errors.length) {
        throw new Error(`[RuleEngineController] There are errors in configuration that prevents from running processing campaigns with it: ` +
          errors.map(e => e.message).join(',\n'));
      }
      let campaignId = config.execution!.campaignId!;
      let advertiserId = config.execution!.advertiserId!;
      const engine = new RuleEngine(config, this.dv_facade, this.ruleEvaluator);
      // load data from feed(s) and download SDF from DV350 in parallel
      let feedDataPromise = this.feedService.loadAll(config.feedInfo!);
      let sdfPromise = this.dv_facade.downloadSdf(advertiserId, campaignId);
      let [feedData, sdf] = await Promise.all([feedDataPromise, sdfPromise]);
      if (!sdf.campaigns)
        throw new Error(`[RuleEngineController] Campaign ${campaignId} wasn't found`);
      if (!sdf.insertionOrders) 
        throw new Error(`[RuleEngineController] Campaign ${campaignId} has no insersion orders`);

      let updatedItems = await engine.run(feedData, sdf);
      console.log(`[RuleEngineController] Compeleted. Updated items: ${updatedItems}`);
      // TODO: we need to pass log
      if (options.sendNotifications)
        this.notifyOnSuccess(config);
    } catch (e) {
      if (options.sendNotifications)
        this.notifyOnError(e, config);
      throw e;
    }
  }

  notifyOnError(e: Error, config: Config) {
    if (config.execution!.notificationEmails) {
      let campaignId = config.execution!.campaignId!;
      let advertiserId = config.execution!.advertiserId!;
      // TODO: mroe information (timestamp started/ended)
      const text = `Execution for advertiser=${advertiserId} campaign=${campaignId} failed: \n${e.message}\n\n` + e;
      sendEmail(config.execution!.notificationEmails, 'Triggerator Status: Failure', text);
    }
  }

  notifyOnSuccess(config: Config) {
    if (config.execution!.notificationEmails) {
      let campaignId = config.execution!.campaignId!;
      let advertiserId = config.execution!.advertiserId!;
      const text = `Execution for advertiser=${advertiserId} campaign=${campaignId} succeeded`;
      sendEmail(config.execution!.notificationEmails, 'Triggerator Status: Success', text);
    }
  }
}