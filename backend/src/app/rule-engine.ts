/**
 * Copyright 2021 Google LLC
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
import math, { MathNode } from 'mathjs';
import { Config, RuleInfo } from '../types/config';
import DV360Facade from './dv360-facade';
import { FeedData, RecordSet, SDF, SdfFull } from '../types/types';
import { Logger } from '../types/logger';

const { create, all, factory } = require('mathjs');
const allWithCustomFunctions = {
  ...all,
  createEqual: factory('equal', [], () => function equal(a: any, b: any) {
    return a === b
  }),
  createUnequal: factory('unequal', [], () => function unequal(a: any, b: any) {
    return a !== b
  }),
  createSmaller: factory('smaller', [], () => function smaller(a: any, b: any) {
    return a < b
  }),
  createSmallerEq: factory('smallerEq', [], () => function smallerEq(a: any, b: any) {
    return a <= b
  }),
  createLarger: factory('larger', [], () => function larger(a: any, b: any) {
    return a > b
  }),
  createLargerEq: factory('largerEq', [], () => function largerEq(a: any, b: any) {
    return a >= b
  }),
  createCompare: factory('compare', [], () => function compare(a: any, b: any) {
    return a > b ? 1 : a < b ? -1 : 0
  })
}
const parseCustom = create(allWithCustomFunctions).parse;
const evaluateCustom = create(allWithCustomFunctions).evaluate;

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
        let expr = parseCustom(rule.condition);
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
            expr = parseCustom(rule.condition)
          } catch (e) {
            throw new Error(`[RuleEvaluator] expression "${rule.condition}" can't be parsed: ${e.message}`);
          }
          this.parsed_conditions[rule.condition] = expr;
        }
        try {
          if (expr.evaluate(row)) {
            return rule;
          }
        } catch(e) {
          throw new Error(`[RuleEvaluator] '${rule.name}' rule's evaluation failed: ${e.message}`);
        }
      }
      //else throw new Error('Condition not set for rule ' + rule.name);
    }
    return null;
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
      this.logger.debug(`[RuleEngine] processing insertionOrder ${io[SDF.IO.Name]} (status=${io[SDF.LI.Status]}), rowName=${rowName}, ruleName=${ruleName}`);
      if (rowName === null || ruleName === null) {
        this.logger.warn(`[RuleEngine] skipping IO '${io[SDF.IO.Name]}' (${io[SDF.IO.IoId]}) as its Details field contains no row/rule: ${details}`);
        continue;
      }
      const key = rowName + ruleName;
      iosMap[key] = iosMap[key] || [];
      iosMap[key].push({
        ioId: io[SDF.LI.IoId],
        status: io[SDF.LI.Status]
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
            updatedItems += await this.deactivateIos(advertiserId, ioIds);
          }
        }
      }
      // activate
      let ioIds = iosMap[rowName + (rule ? rule.name : '')];
      if (ioIds) {
        updatedItems += await this.activateIos(advertiserId, ioIds);
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

    return updatedItems;
  }

  private async activateIos(advertiserId: string, ios: Array<{ ioId: string, status: string }>): Promise<number> {
    let changesCount = 0;
    for (const io of ios) {
      if (!this.forceUpdate && io.status == 'Active') {
        // NOTE: the format of log message is important, it's used in reportin (search before changing)
        this.logger.info(`[RuleEngine] activating IO ${io.ioId} skipped because it's already active and forceUpdate=false`);
        continue;
      };
      this.logger.debug('[RuleEngine] activating IO ' + io.ioId);
      if (!this.dryRun) {
        await this.dv_facade.updateInsertionOrderStatus(advertiserId, io.ioId, 'active');
      }
      changesCount++;
      this.updateLog.push(`IO:${io.ioId}:Status=Active`);
    }

    return changesCount;
  }

  private async deactivateIos(advertiserId: string, ios: Array<{ ioId: string, status: string }>): Promise<number> {
    var changesCount = 0;
    for (const io of ios) {
      if (!this.forceUpdate && io.status != 'Active') {
        // NOTE: the format of log message is important, it's used in reportin (search before changing)
        this.logger.info(`[RuleEngine] deactivating IO ${io.ioId} skipped because it's already non-active and forceUpdate=false`);
        continue;
      };
      this.logger.debug('[RuleEngine] deactivating IO ' + io.ioId);
      if (!this.dryRun) {
        await this.dv_facade.updateInsertionOrderStatus(advertiserId, io.ioId, 'paused');
      }
      changesCount++;
      this.updateLog.push(`IO:${io.ioId}:Status=Paused`);
    }

    return changesCount;
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

  private async processIoLineItems(advertiserId: string, activeRule: RuleInfo|null, 
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
            // NOTE: the format of log message is important, it's used in reportin (search before changing)
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
            // NOTE: the format of log message is important, it's used in reportin (search before changing)
            this.logger.info(`[RuleEngine] activating LI ${liId} skipped because it's already active and forceUpdate=false`);
          }
        }
      }
    }
    return changesCount;
  }
}