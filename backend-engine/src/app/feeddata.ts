import { FeedInfo } from "./config";

export default class FeedData {
  feedInfo: FeedInfo;
  key: string;
  name: string;
  columns: string[];
  values: any[];

  constructor(feedInfo: FeedInfo, columns: string[], values: any[]) {
    this.feedInfo = feedInfo;
    this.key = feedInfo.name + '.' + feedInfo.key_column;
    this.name = feedInfo.name;
    this.columns = columns;
    this.values = values;
  }
  
  public rowCount(): number {
    return 0;
  }
}