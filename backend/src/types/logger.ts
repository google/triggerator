interface LogMethod {
  (level: string, message: string, ...meta: any[]): Logger;
  (level: string, message: any): Logger;
  (entry: LogEntry): Logger;
}
interface LogEntry {
  level: string;
  message: string;
  [optionName: string]: any;
}

interface LeveledLogMethod {
  (message: string, ...meta: any[]): Logger;
  (message: any): Logger;
  (infoObject: object): Logger;
}

export interface Logger {
  log: LogMethod;

  error: LeveledLogMethod;
  warn: LeveledLogMethod;
  info: LeveledLogMethod;
  debug: LeveledLogMethod;
}

// export class ConsoleLogger implements Logger {
//   log(level: string, message: string, ...meta: any[]): Logger {
//     return this;
//   }
//   log(level: string, message: any): Logger {
//     return this;
//   }
//   log(entry: LogEntry): Logger {
//     return this;
//   }


//   error: LeveledLogMethod;
//   warn: LeveledLogMethod;
//   info: LeveledLogMethod;
//   debug: LeveledLogMethod;

// }