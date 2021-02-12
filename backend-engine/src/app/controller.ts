import Config from './config';
import ConfigService from './config-service';
import FeedService from './feed-service';
import ExecutionEngine from './engine';
import FeedData from './feeddata';

export default class Contoller {

  constructor(private configService: ConfigService, private feedService: FeedService) {
  }

  async loadFeed(config: Config): Promise<FeedData> {
    return this.feedService.loadAll(config.feedInfo);
    //return new FeedData();
  }

  async run() {    
    let config: Config;
    try {
      config = await this.configService.load();

    } catch (e) {
      this.logError(e);
      throw e;
    }
    try {
      let feedData = await this.loadFeed(config);
      const engine = new ExecutionEngine(config);
      await engine.run(feedData);
    } catch (e) {
      this.notifyOnError(e, config);
      this.logError(e, config);
      throw e;
    }
  }
  notifyOnError(e: any, config: Config) {
    throw new Error('Method not implemented.');
    if (config.execution.notificationEmails) {
      // TODO: send an email
    }
  }
  logError(e: any, config?: Config) {
    console.log(e);
  }
}