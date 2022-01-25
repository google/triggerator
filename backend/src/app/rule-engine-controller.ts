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
import { Config } from '../types/config';
import FeedService from './feed-service';
import RuleEngine, { RuleEngineOptions, RuleEvaluator } from './rule-engine';
import DV360Facade from './dv360-facade';
import { Logger } from '../types/logger';
import logger from './logger-winston';

export default class RuleEngineController {
  constructor(private config: Config,
    private logger: Logger,
    private ruleEvaluator: RuleEvaluator,
    private feedService: FeedService,
    private dv_facade: DV360Facade) {
      if (!logger) throw new Error('[RuleEngineController] Required argument logger is missing');
  }

  async run(configSpreadsheetId: string, options?: RuleEngineOptions): Promise<number> {
    if (!configSpreadsheetId) throw new Error(`[RuleEngineController] Configuration was not specified`);
    const config = this.config;
    let advertiserId = config.execution!.advertiserId!;
    let campaignId = config.execution!.campaignId!;

    logger.info(`Starting engine execution for configuration ${config.title} (${config.id}), advertiserId=${advertiserId}, campaignId=${campaignId} `, {config: config, component: 'RuleEngineController'})
    const engine = new RuleEngine(config, this.logger, this.dv_facade, this.ruleEvaluator, options);
    // load data from feed(s) and download SDF from DV350 in parallel
    let feedDataPromise = this.feedService.loadAll(config.feedInfo!);
    let sdfPromise = this.dv_facade.downloadSdf(advertiserId, campaignId);
    let [feedData, sdf] = await Promise.all([feedDataPromise, sdfPromise]);
    if (!sdf.campaigns)
      throw new Error(`[RuleEngineController] Campaign ${campaignId} wasn't found`);
    if (!sdf.insertionOrders)
      throw new Error(`[RuleEngineController] Campaign ${campaignId} has no insersion orders`);

    let updatedItems = await engine.run(feedData, sdf);
    return updatedItems;
  }
}