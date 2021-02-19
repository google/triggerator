import { Config } from '../types/config';
import ConfigService from './config-service';
import FeedService from './feed-service';
import RuleEngine, { RuleEvaluator } from './rule-engine';
import DV360Facade from './dv360-facade';

export default class RuleEngineController {
  constructor(private configService: ConfigService, 
    private ruleEvaluator: RuleEvaluator,
    private feedService: FeedService, 
    private dv_facade: DV360Facade) {
  }

  // async loadFeed(config: Config): Promise<FeedData> {
  //   return this.feedService.loadAll(config.feedInfo);
  // }

  async run(configSpreadsheetId: string) {
    let config: Config;
    try {
      config = await this.configService.loadConfiguration(configSpreadsheetId);

    } catch (e) {
      this.logError(e);
      throw e;
    }
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
      await engine.run(feedData, sdf);
    } catch (e) {
      this.notifyOnError(e, config);
      this.logError(e, config);
      throw e;
    }
  }

  notifyOnError(e: any, config: Config) {
    //throw new Error('Method not implemented.');
    if (config.execution!.notificationEmails) {
      // TODO: send an email
    }
  }
  
  logError(e: any, config?: Config) {
    console.log(e);
  }
}