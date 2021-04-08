import { Config } from '../types/config';
import ConfigService from './config-service';
import FeedService from './feed-service';
import RuleEngine, { RuleEvaluator } from './rule-engine';
import DV360Facade from './dv360-facade';

export interface ProcessingOptions {
  sendNotificationsOnError: boolean
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

      await engine.run(feedData, sdf);
    } catch (e) {
      if (options.sendNotificationsOnError)
        this.notifyOnError(e, config);
      throw e;
    }
  }

  notifyOnError(e: Error, config: Config) {
    if (config.execution!.notificationEmails) {
      // TODO: send an email
    }
  }
}