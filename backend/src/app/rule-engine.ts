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
import { create, all, factory, MathNode } from 'mathjs';
import { LocalDateTime, LocalDate, Duration, Period, DateTimeFormatter } from '@js-joda/core';

import { Config, RuleInfo, SDF } from '../types/config';
import DV360Facade from './dv360-facade';
import { FeedData, RecordSet, SdfFull } from '../types/types';
import { Logger } from '../types/logger';

const mathjs = create(all);
// MathJS customization:
//  - date/time support (using type from @js-joda: LocalDateTime, LocalDate, Duration, Period)
//  - support comparison operation (==,!=,>,<,>=,<=) for arbitrary types, including string (originally mathjs supports only numbers)
mathjs!.import!([
  // data types
  factory('LocalDateTime', ['typed'], function createLocalDateTime({ typed }: { typed?: any }) {
    typed.addType({
      name: 'LocalDateTime',
      test: (x: any) => x && x.constructor.name === 'LocalDateTime'
    })
    return LocalDateTime
  }, { lazy: false }),

  factory('LocalDate', ['typed'], function createLocalDate({ typed }: { typed?: any }) {
    typed.addType({
      name: 'LocalDate',
      test: (x: any) => x && x.constructor.name === 'LocalDate'
    })
    return LocalDate
  }, { lazy: false }),

  factory('Duration', ['typed'], function createDuration({ typed }: { typed?: any }) {
    typed.addType({
      name: 'Duration',
      test: (x: any) => x && x.constructor.name === 'Duration'
    })
    return Duration
  }, { lazy: false }),

  factory('Period', ['typed'], function createPeriod({ typed }: {typed?: any}) {
    typed.addType({
      name: 'Period',
      test: (x: any) => x && x.constructor.name === 'Period'
    })
    return Period
  }, { lazy: false }),

  // conversion functions and factory functions
  factory('datetime', ['typed'], function createLocalDateTime({ typed }: { typed?: any }) {
    return typed('datetime', {
      '': () => LocalDateTime.now(),
      'null': () => LocalDateTime.now(),
      'string': (x: any) => LocalDateTime.parse(x),
      'string, string': (x: any, format: string) => { let formatter = DateTimeFormatter.ofPattern(format); return LocalDateTime.parse(x, formatter); }
    })
  }),

  factory('date', ['typed'], function createLocalDateTime({ typed }: { typed?: any }) {
    return typed('datetime', {
      '': () => LocalDate.now(),
      'null': () => LocalDate.now(),
      'string': (x: any) => LocalDate.parse(x),
      'string,string': (x: any, format: string) => { let formatter = DateTimeFormatter.ofPattern(format); return LocalDate.parse(x, formatter); },
      'LocalDateTime': (x: any) => x.toLocalDate(),
      'number, number, number': (a: any, b: any, c: any) => LocalDate.of(a, b, c)
    })
  }),

  factory('duration', ['typed'], function createDuration({ typed }: { typed?: any }) {
    return typed('duration', {
      'string': (x: any) => Duration.parse(x)
    })
  }),

  factory('period', ['typed'], function createDuration({ typed }: { typed?: any }) {
    return typed('period', {
      'string': (x: any) => Period.parse(x)
    })
  }),

  // operations
  factory('add', ['typed'], function createLocalDateTimeAdd({ typed }: { typed?: any }) {
    return typed('add', {
      'LocalDateTime, Duration': (a: any, b: any) => a.plus(b),
      'LocalDate, Period': (a: any, b: any) => a.plus(b),
      'any, any': (a: any, b: any) => a + b
    })
  }),

  factory('subtract', ['typed'], function createLocalDateTimeSubtract({ typed }: { typed?: any }) {
    return typed('subtract', {
      'LocalDateTime, Duration': (a: any, b: any) => a.minus(b),
      'LocalDate, Period': (a: any, b: any) => a.minus(b),
      'LocalDateTime, LocalDateTime': (a: any, b: any) => Duration.between(a, b),
      'LocalDate, LocalDate': (a: any, b: any) => Duration.between(a, b),
      'any, any': (a: any, b: any) => a - b
    })
  }),

  factory('compare', ['typed'], function createLocalDateTimeEqual({ typed }: { typed?: any}) {
    return typed('compare', {
      'LocalDateTime|LocalDate, LocalDateTime|LocalDate': (a: any, b: any) => a.compareTo(b),
      'any, any': (a: any, b: any) => a > b ? 1 : a < b ? -1 : 0
    })
  }),

  factory('equal', ['typed', 'compare'], function createEqual({ typed, compare }: { typed?: any, compare?: any}) {
    return typed('equal', {
      'any, any': (a: any, b: any) => compare(a, b) === 0
    })
  }),

  factory('unequal', ['typed', 'compare'], function createUnequal({ typed, compare }: {typed?: any, compare?: any}) {
    return typed('unequal', {
      'any, any': (a: any, b: any) => compare(a, b) !== 0
    })
  }),

  factory('larger', ['typed', 'compare'], function createLarger({ typed, compare }: { typed?: any, compare?: any }) {
    return typed('larger', {
      'any, any': (a: any, b: any) => compare(a, b) > 0 //a > b
    })
  }),

  factory('largerEq', ['typed', 'compare'], function createLargerEq({ typed, compare }: { typed?: any, compare?: any }) {
    return typed('largerEq', {
      'any, any': (a: any, b: any) => compare(a, b) >= 0
    })
  }),

  factory('smallerEq', ['typed', 'compare'], function createSmallerEq({ typed, compare }: { typed?: any, compare?: any }) {
    return typed('smallerEq', {
      'any, any': (a: any, b: any) => compare(a, b) <= 0
    })
  }),

  factory('smaller', ['typed', 'compare'], function createSmaller({ typed, compare }: { typed?: any, compare?: any }) {
    return typed('smaller', {
      'any, any': (a: any, b: any) => compare(a, b) < 0
    })
  }),

  factory('today', [], function createToday() {
    return () => LocalDate.now();
  }),

  factory('now', [], function createNow() {
    return () => LocalDateTime.now();
  })

], { override: true });

const math_parse = mathjs.parse!;

export interface RuleEngineOptions {
  /**
   * Forcely update statuses (of IO/LI) despite their current status.
   */
  forceUpdate?: boolean;
  /**
   * Do not issue actual API call.
   */
  dryRun?: boolean;
}

export class RuleEvaluator {
  parsed_conditions: Record<string, MathNode> = {};

  validateRule(rule: RuleInfo) {
    if (rule.condition) {
      try {
        let expr = math_parse(rule.condition);
      } catch (e) {
        return e.message;
      }
    }
  }

  getActiveRule(rules: RuleInfo[], row: Record<string, any>): RuleInfo | null {
    for (let i = 0; i < rules.length; i++) {
      let rule = rules[i];
      if (rule.condition) {
        let expr = this.parsed_conditions[rule.condition];
        if (!expr) {
          try {
            expr = math_parse(rule.condition)
          } catch (e) {
            throw new Error(`[RuleEvaluator] expression "${rule.condition}" can't be parsed: ${e.message}`);
          }
          this.parsed_conditions[rule.condition] = expr;
        }
        try {
          if (expr.evaluate(row)) {
            return rule;
          }
        } catch (e) {
          throw new Error(`[RuleEvaluator] '${rule.name}' rule's evaluation failed: ${e.message}`);
        }
      }
      //else throw new Error('Condition not set for rule ' + rule.name);
    }
    return null;
  }

  evaluateExpression(value: string, row: Record<string, string>): any {
    let expr = this.parsed_conditions[value];
    if (!expr) {
      try {
        expr = math_parse(value)
      } catch (e) {
        throw new Error(`[RuleEvaluator] expression "${value}" can't be parsed: ${e.message}`);
      }
      this.parsed_conditions[value] = expr;
    }
    try {
      return expr.evaluate(row);
    } catch (e) {
      throw new Error(`[RuleEvaluator] expressions "${value}" evaluation failed: ${e.message}`);
    }
  }
}

export default class RuleEngine {
  private config: Config;
  private forceUpdate;
  private dryRun;
  updateLog: string[] = [];

  constructor(config: Config,
    private logger: Logger,
    private dv_facade: DV360Facade,
    private ruleEvaluator: RuleEvaluator,
    options?: RuleEngineOptions) {
    if (!logger) throw new Error('[RuleEngine] ArgumentException: Required argument logger is missing');
    if (!config) throw new Error(`[RuleEngine] ArgumentException: Config should be specified`);
    if (!config.rules)
      throw new Error('[RuleEngine] Config doesn\'t contain rules section');
    if (!ruleEvaluator) throw new Error(`[RuleEngine] ArgumentException: RuleEvaluator should be specified`);
    if (!dv_facade) throw new Error(`[RuleEngine] ArgumentException: DV360Facade should be specified`);
    this.config = config;
    this.dryRun = options?.dryRun ?? false;
    this.forceUpdate = options?.forceUpdate ?? false;
  }

  async run(feedData: FeedData, sdf: SdfFull): Promise<number> {
    if (!this.config.rules || !this.config.rules.length)
      throw new Error(`[RuleEngine] There no rules in configuration to process`);
    if (!sdf.insertionOrders)
      throw new Error(`[RuleEngine] Campaign has no insersion orders`);
    let nameColumn = this.config.feedInfo!.name_column!;
    let iosMap: Record<string, Array<{ ioId: string, status: string }>> = {};
    let updatedItems = 0;
    let advertiserId = sdf.advertiserId;
    this.logger.info(`[RuleEngine] Starting execution with feed data of ${feedData.rowCount} rows`);

    // build a map iosMap for composite key to IO
    for (let i = 0; i < sdf.insertionOrders.rowCount; i++) {
      let io = sdf.insertionOrders.getRow(i);
      // extract a reference to a rule from the IO (it's kept in Detail field)
      let details = io[SDF.IO.Details];
      let rowName: any = /row:(.*?)(?:\\n|$)/m.exec(details);
      let ruleName: any = /rule:(.*?)(?:\\n|$)/m.exec(details);
      rowName = (rowName && rowName[1].trim());
      ruleName = (ruleName && ruleName[1].trim());
      this.logger.debug(`[RuleEngine] processing insertionOrder ${io[SDF.IO.Name]} (status=${io[SDF.IO.Status]}), rowName=${rowName}, ruleName=${ruleName}`);
      if (rowName === null || ruleName === null) {
        this.logger.warn(`[RuleEngine] skipping IO '${io[SDF.IO.Name]}' (${io[SDF.IO.IoId]}) as its Details field contains no row/rule: ${details}`);
        continue;
      }
      const key = rowName + ruleName;
      iosMap[key] = iosMap[key] || [];
      iosMap[key].push({
        ioId: io[SDF.IO.IoId],
        status: io[SDF.IO.Status]
      });
    }
    // build a map lisMap for composite key to LI for those LIs that are in "static" IO
    let lisMap: Record<string, Array<{ liId: string, status: string }>> = {};
    if (sdf.lineItems && '' in iosMap) {
      for (let item of iosMap['']) {
        let lis = sdf.lineItems.findAll(SDF.LI.IoId, item.ioId);
        for (const idx of lis) {
          let li = sdf.lineItems.getRow(idx);
          let details = li[SDF.LI.Details];
          let rowName: any = /row:(.*?)(?:\\n|$)/m.exec(details);
          let ruleName: any = /rule:(.*?)(?:\\n|$)/m.exec(details);
          rowName = (rowName && rowName[1].trim());
          ruleName = (ruleName && ruleName[1].trim());
          if (rowName === null || ruleName === null) continue;
          const key = rowName + ruleName;
          lisMap[key] = lisMap[key] || [];
          lisMap[key].push({
            liId: li[SDF.LI.LineItemId],
            status: li[SDF.LI.Status]
          });
        }
      }
    }

    // calculate for each row from data feed what rule is effective for it
    let effective_rules: Array<RuleInfo | null> = []
    for (let rowNo = 0; rowNo < feedData.rowCount; rowNo++) {
      effective_rules[rowNo] = this.ruleEvaluator.getActiveRule(this.config.rules, feedData.getRow(rowNo));
    }

    // Process case #1 IOs depend on rows and rules - we'll be enabling/disabling IOs (and don't touch LIs)
    for (let rowNo = 0; rowNo < feedData.rowCount; rowNo++) {
      let rule = effective_rules[rowNo];
      let rowName = feedData.get(nameColumn, rowNo);
      // first deactivate
      for (let ruleInfo of this.config.rules) {
        if (!rule || ruleInfo.name != rule.name) {
          let ioIds = iosMap[rowName + ruleInfo.name];
          if (ioIds) {
            updatedItems += await this.deactivateIos(advertiserId, ioIds, sdf.lineItems);
          }
        }
      }
      // activate
      let ioIds = iosMap[rowName + (rule ? rule.name : '')];
      if (ioIds) {
        updatedItems += await this.activateIos(advertiserId, ioIds, sdf.lineItems);
      }
    }

    // Process case #2 - IOs depends on rows only - we'll be enabling/disabling LIs (and don't touch IOs)
    if (sdf.lineItems) {
      for (let rowNo = 0; rowNo < feedData.rowCount; rowNo++) {
        let rule = effective_rules[rowNo];
        let rowName = feedData.get(nameColumn, rowNo);
        let ioIds = iosMap[rowName];
        if (ioIds) {
          updatedItems += await this.processIoLineItems(advertiserId, rule, ioIds, sdf.lineItems);
        }
      }
    }

    // Process case #3 - IOs don't depend on anything ("static")
    // Again we'll be enabling/disabling LIs
    // TODO: look like it can be brought to the case #2
    if ('' in iosMap) {
      for (let rowNo = 0; rowNo < feedData.rowCount; rowNo++) {
        let rule = effective_rules[rowNo];
        let rowName = feedData.get(nameColumn, rowNo);
        // first deactivate
        for (let ruleInfo of this.config.rules) {
          if (!rule || ruleInfo.name != rule.name) {
            let liIds = lisMap[rowName + ruleInfo.name];
            if (liIds) {
              updatedItems += await this.deactivateLis(advertiserId, liIds);
            }
          }
        }
        // activate
        var liIds = lisMap[rowName + (rule ? rule.name : '')];
        if (liIds) {
          updatedItems += await this.activateLis(advertiserId, liIds);
        }
      }
    }

    // TODO: check of LIs that weren't touched and log a warning
    return updatedItems;
  }

  private async activateIos(advertiserId: string, ios: Array<{ ioId: string, status: string }>, lineItems: RecordSet | undefined): Promise<number> {
    let changesCount = 0;
    for (const io of ios) {
      if (!this.forceUpdate && io.status == 'Active') {
        // NOTE: the format of log message is important, it's used in reporting (search before changing)
        this.logger.info(`[RuleEngine] activating IO ${io.ioId} skipped because it's already active and forceUpdate=false`);
        this.logLineItemsOfIO(io.ioId, lineItems, 'activated', /*skipped=*/ true);
        continue;
      };
      this.logger.debug('[RuleEngine] activating IO ' + io.ioId);
      if (!this.dryRun) {
        await this.dv_facade.updateInsertionOrderStatus(advertiserId, io.ioId, 'active');
      }
      changesCount++;
      this.updateLog.push(`IO:${io.ioId}:Status=Active`);

      // we need to log about all active nested line items
      this.logLineItemsOfIO(io.ioId, lineItems, 'activated', /*skipped=*/ false);
    }

    return changesCount;
  }

  private async deactivateIos(advertiserId: string, ios: Array<{ ioId: string, status: string }>, lineItems: RecordSet | undefined): Promise<number> {
    var changesCount = 0;
    for (const io of ios) {
      if (!this.forceUpdate && io.status != 'Active') {
        // NOTE: the format of log message is important, it's used in reporting (search before changing)
        this.logger.info(`[RuleEngine] deactivating IO ${io.ioId} skipped because it's already non-active and forceUpdate=false`);
        this.logLineItemsOfIO(io.ioId, lineItems, 'deactivated', /*skipped=*/ true);
        continue;
      };
      this.logger.debug('[RuleEngine] deactivating IO ' + io.ioId);
      if (!this.dryRun) {
        await this.dv_facade.updateInsertionOrderStatus(advertiserId, io.ioId, 'paused');
      }
      changesCount++;
      this.updateLog.push(`IO:${io.ioId}:Status=Paused`);

      // we need to log about all active nested line items
      this.logLineItemsOfIO(io.ioId, lineItems, 'deactivated', false);
    }

    return changesCount;
  }

  private logLineItemsOfIO(ioId: string, lineItems: RecordSet | undefined, statusName: string, skipped: boolean) {
    if (lineItems) {
      let lis = lineItems.findAll('Io Id', ioId);
      for (let index of lis) {
        let liId = lineItems.get('Line Item Id', index);
        let status = lineItems.get('Status', index);
        if (status === 'Active') {
          // NOTE: the format of log message is important, it's used in reporting (search before changing)
          this.logger.info(`[RuleEngine] ${skipped ? 'skipped ' : ''}${statusName} IO ${ioId} has active LI ${liId}`);
        }
      }
    }
  }

  private async activateLis(advertiserId: string, lis: Array<{ liId: string, status: string }>): Promise<number> {
    let changesCount = 0;
    for (let li of lis) {
      if (!this.forceUpdate && li.status == 'Active') {
        // NOTE: the format of log message is important, it's used in reportin (search before changing)
        this.logger.info(`[RuleEngine] activating LI ${li.liId} skipped because it's already active and forceUpdate=false`);
        continue;
      };
      this.logger.debug('[RuleEngine] activating Li ' + li.liId);
      if (!this.dryRun) {
        await this.dv_facade.updateLineItemStatus(advertiserId, li.liId, 'active');
      }
      changesCount++;
      this.updateLog.push(`LI:${li.liId}:Status=Active`);
    }

    return changesCount;
  }

  private async deactivateLis(advertiserId: string, lis: Array<{ liId: string, status: string }>): Promise<number> {
    let changesCount = 0;
    for (let li of lis) {
      if (!this.forceUpdate && li.status != 'Active') {
        // NOTE: the format of log message is important, it's used in reportin (search before changing)
        this.logger.info(`[RuleEngine] deactivating LI ${li.liId} skipped because it's already non-active and forceUpdate=false`);
        continue;
      };

      this.logger.debug('[RuleEngine] deactivating Li ' + li.liId);
      if (!this.dryRun) {
        await this.dv_facade.updateLineItemStatus(advertiserId, li.liId, 'paused');
      }
      changesCount++;
      this.updateLog.push(`LI:${li.liId}:Status=Paused`);
    }

    return changesCount;
  }

  private async processIoLineItems(advertiserId: string, activeRule: RuleInfo | null,
    ioIds: Array<{ ioId: string, status: string }>, lineItems: RecordSet) {
    let changesCount = 0;
    for (let io of ioIds) {
      let lis = lineItems.findAll('Io Id', io.ioId);
      this.logger.debug(`[RuleEngine] Processing LIs of IO ${io.ioId}: ${lis}`);
      for (let index of lis) {

        let liId = lineItems.get('Line Item Id', index);
        let details = lineItems.get('Details', index);
        let ruleName: any = /rule:(.+?)(?:\\n|$)/m.exec(details);
        ruleName = (ruleName && ruleName[1].trim()) || '';
        if (!ruleName) continue;

        let status = lineItems.get('Status', index);
        if (ruleName != activeRule?.name) {
          // deactivate
          if (this.forceUpdate || status == 'Active') {
            this.logger.debug('[RuleEngine] deactivating LI ' + liId);
            if (!this.dryRun) {
              await this.dv_facade.updateLineItemStatus(advertiserId, liId, 'paused');
            }
            changesCount++;
            this.updateLog.push(`LI:${liId}:Status=Paused`);
          } else {
            // NOTE: the format of log message is important, it's used in reporting (search before changing)
            this.logger.info(`[RuleEngine] deactivating LI ${liId} skipped because it's already non-active and forceUpdate=false`);
          }
        } else if (ruleName == activeRule?.name) {
          // activate
          if (this.forceUpdate || status != 'Active') {
            this.logger.debug('[RuleEngine] activating LI ' + liId);
            if (!this.dryRun) {
              await this.dv_facade.updateLineItemStatus(advertiserId, liId, 'active');
            }
            changesCount++;
            this.updateLog.push(`LI:${liId}:Status=Active`);
          } else {
            // NOTE: the format of log message is important, it's used in reporting (search before changing)
            this.logger.info(`[RuleEngine] activating LI ${liId} skipped because it's already active and forceUpdate=false`);
          }
        }
      }
    }
    return changesCount;
  }
}