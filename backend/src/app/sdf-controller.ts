import { Config } from '../types/config';
import ConfigService from './config-service';
import FeedService from './feed-service';
import { RuleEvaluator } from './rule-engine';
import DV360Facade from './dv360-facade';
import SdfService, { GenerateSdfOptions } from './sdf-service';
import { FeedData } from '../types/types';

export default class SdfController {
  constructor(private configService: ConfigService,
    private ruleEvaluator: RuleEvaluator,
    private feedService: FeedService,
    private dvFacade: DV360Facade) {
  }
  config?: Config;

  async generateSdf(configId: string, options: GenerateSdfOptions): Promise<string> {
    options = options || {};
    console.log(`[SdfController] Generating SDF for configuration ${configId} with options:\n ${JSON.stringify(options, null, 2)}`);
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
      console.error(`[SdfController] Fetching configuration failed: ${e.message}`);
      throw e;
    }
    this.config = config;

    // #2 Validate configuration
    let errors = this.configService.validateGeneratingConfiguration(config, !!options.update);
    if (errors && errors.length)
      throw new Error(`[SdfController] There are errors in configuration that prevents from generating SDFs:\n` +
        errors.map(e => e.message).join(',\n')
      );

    // #3 Load data from feed(s)
    let sdfSvc = new SdfService(config, this.ruleEvaluator, this.dvFacade);
    let feedData: FeedData;
    try {
      feedData = await this.feedService.loadAll(config.feedInfo!);
    } catch (e) {
      console.error(`[SdfController] Fetching combined feed failed: ${e.message}`);
      throw e;
    }
    if (feedData.rowCount === 0) {
      throw new Error(`[SdfController] Combined feed contains no rows, cannot proceed with SDF generation`);
    }

    // #4 Generate SDF
    let filepath: string;
    if (!options.fileName) {
      options.fileName = "sdf-" + new Date().toISOString().replace(/\-/g, "").replace(/\:/g, "").replace(".", "") + ".zip";
    }
    try {
      filepath = await sdfSvc.generateSdf(feedData, options);
    } catch (e) {
      console.error(`[SdfController] Generating SDF failed: ${e.message}`);
      throw e;
    }
    return filepath;
  }
}