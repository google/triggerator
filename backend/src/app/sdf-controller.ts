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
import ConfigService from './config-service';
import FeedService from './feed-service';
import { RuleEvaluator } from './rule-engine';
import DV360Facade from './dv360-facade';
import SdfService, { GenerateSdfOptions } from './sdf-service';
import { FeedData } from '../types/types';
import { getCurrentDateTimestamp } from './utils';
import { Logger } from '../types/logger';
import ConfigValidator from './config-validator';

export default class SdfController {
  constructor(
    private logger: Logger,
    private configService: ConfigService,
    private ruleEvaluator: RuleEvaluator,
    private feedService: FeedService,
    private dvFacade: DV360Facade) {
    if (!logger) throw new Error('[SdfController] ArgumentException: Required argument logger is missing');
  }
  config?: Config;

  async generateSdf(configId: string, options: GenerateSdfOptions): Promise<string> {
    options = options || {};
    this.logger.info(`[SdfController] Generating SDF for configuration ${configId} with options:\n ${JSON.stringify(options, null, 2)}`);
    if (!options.update) {
      if (!options.startDate)
        throw new Error(`[SdfController] Campaign start date should be specified`);
      if (!options.endDate)
        throw new Error(`[SdfController] Campaign end date should be specified`);
    }

    // #1 Fetch configuration
    let config: Config;
    try {
      config = await this.configService.loadConfiguration(configId);
    } catch (e) {
      this.logger.error(`[SdfController] Fetching configuration failed: ${e.message}`, e);
      e.logged = true;
      throw e;
    }
    this.config = config;

    // #2 Validate configuration
    let errors = ConfigValidator.validateGeneratingConfiguration(config, !!options.update);
    if (errors && errors.length)
      throw new Error(`[SdfController] There are errors in configuration that prevents from generating SDFs:\n` +
        errors.map(e => e.message).join(',\n')
      );

    // #3 Load data from feed(s)
    let sdfSvc = new SdfService(config, this.logger, this.ruleEvaluator, this.dvFacade);
    let feedData: FeedData;
    try {
      feedData = await this.feedService.loadAll(config.feedInfo!);
    } catch (e) {
      this.logger.error(`[SdfController] Fetching combined feed failed: ${e.message}`, e);
      e.logged = true;
      throw e;
    }
    if (feedData.rowCount === 0) {
      throw new Error(`[SdfController] Combined feed contains no rows, cannot proceed with SDF generation`);
    }

    // #4: validate columns for first row
    errors = ConfigValidator.validateGeneratingRuntimeConfiguration(config, feedData);
    if (errors && errors.length)
    throw new Error(`[SdfController] There are errors in configuration that prevents from generating SDFs:\n` +
      errors.map(e => e.message).join(',\n')
    );

    // #5 Generate SDF
    let filepath: string;
    if (!options.fileName) {
      options.fileName = "sdf-" + getCurrentDateTimestamp() + ".zip";
    }
    try {
      filepath = await sdfSvc.generateSdf(feedData, options);
    } catch (e) {
      this.logger.error(`[SdfController] Generating SDF failed: ${e.message}`, e);
      e.logged = true;
      throw e;
    }
    return filepath;
  }
}