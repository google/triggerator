import Config from "./config";
import FeedData from "./feeddata";

export default class ExecutionEngine {
  config: Config;
  constructor(config: Config) {
    this.config = config;
  }

  async run(feedData: FeedData) {
  }
}

