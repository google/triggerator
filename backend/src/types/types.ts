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
import _ from 'lodash';
import { tryParseNumber } from '../app/utils';

type FeedDataOptions = 'parseNumbers' | 'buildIndex';

export class FeedData {
  recordSet: RecordSet;
  constructor(/* public feedInfo: FeedInfo, */ private values: Record<string, any>[], options?: FeedDataOptions) {
    if (options && options === 'parseNumbers') {
      for (const row of values) {
        _.forOwn(row, (val, key, row) => {
          let parsed = tryParseNumber(val);
          if (parsed !== undefined) {
            row[key] = parsed;
          }
        })
      }
    }
    this.recordSet = RecordSet.fromValues(values);
  }

  // get name(): string {
  //   return this.feedInfo.name;
  // }

  get rowCount(): number {
    return this.values.length;
  }
  get columns(): string[] {
    return this.recordSet.columns;
  }
  get(column: string, row: number): any {
    return this.recordSet.get(column, row);
  }
  set(column: string, row: number, value: any): FeedData {
    this.recordSet.set(column, row, value);
    return this;
  }
  getRow(rowNum: number): Record<string, any> {
    return this.recordSet.getRow(rowNum);
  }
}

export class RecordSet {
  columns: string[];
  values: Record<string, any>[];
  columnNameToIndexMap: Record<string, number>;

  private constructor(columns: string[], values?: Record<string, any>[]) {
    if (!columns || !columns.length) throw new Error(`[RecordSet] columns are empty`);
    if (values) {
      this.values = values;
    } else {
      this.values = [];
    }
    this.columns = columns;
    this.columnNameToIndexMap = {}
    _.forEach(this.columns, (name: string, idx: number) => {
      this.columnNameToIndexMap[name] = idx
    });
  }
  static fromValues(values: Record<string, any>[]): RecordSet {
    if (!values || !values.length) throw new Error(`[RecordSet] InvalidArgument: values are empty`);
    let columns = Object.keys(values[0]);
    if (!_.isPlainObject(values[0])) throw new Error(`[RecordSet] expected an array of objects, got ${typeof values[0]}`);
    return new RecordSet(columns, values);
  }
  static fromMetadata(columns: string[]): RecordSet {
    return new RecordSet(columns);
  }
  /**
   * Returns total number of rows.
   */
  get rowCount(): number {
    return this.values.length;
  }
  /**
   * Returns a value of property `column` of object at specified index.
   * @param column Column name to look up
   * @param rowNum Index row to look up
   */
  get(column: string, rowNum: number): string {
    let row = this.getRow(rowNum);
    return this.getRow(rowNum)[column];
  }
  /**
   * Overwrite a value of property `column` of object at specified index.
   * @param column Columns name to overwrite
   * @param rowNum Index row
   * @param value Column value to overwrite
   */
  set(column: string, rowNum: number, value: any): RecordSet {
    let row = this.getRow(rowNum);
    if (!row) throw new Error(`[RecordSet] invalid row index ${rowNum}`);
    row[column] = value;
    return this;
  }
  /**
   * Returns a row at specified index, optionally including only specified properties.
   * @param rowNum Row index to return. Can be negative_then it's used as offset from the end (e.g. -1 means update the last row).
   * @param [columns] A list of columns to include (of omitted a whole object will be returned)
   */
  getRow(rowNum: number, ...columns: string[]): Record<string, any> {
    if (rowNum < 0)
      rowNum = this.values.length + rowNum;
    let row = this.values[rowNum];
    if (!row) throw new Error(`[RecordSet] invalid row index ${rowNum} (rowCount=${this.rowCount})`);
    if (!columns || !columns.length)
      return row;
    return _.pick(row, columns);
  }
  /**
   * Adds a new object to the end.
   * @param values A new object to add
   * @returns Index of the new row
   */
  addRow(values: Record<string, any>): number {
    // TODO: should we check columns of new object to be same
    this.values.push(values);
    return this.values.length - 1;
  }
  /**
   * Update a row at `rowNum` index with specified values.
   * @param rowNum Row number to update, can be negative_then it's used as offset from the end (e.g. -1 means update the last row).
   * @param values Values to update with
   */
  updateRow(rowNum: number, values: Record<string, any>) {
    if (rowNum < 0)
      rowNum = this.values.length + rowNum;
    let target = this.values[rowNum];
    if (!target) throw new Error(`[RecordSet] invalid row number ${rowNum}, rowCount: ${this.rowCount}`);
    _.forIn(values, (value, key) => {
      target[key] = value;
    });
  }
  removeRow(rowNum: number) {
    if (rowNum < 0)
      rowNum = this.values.length + rowNum;
    this.values.splice(rowNum, 1);
  }
  /**
   * Returns an array of indices of objects those `column`'s values equal to `val`.
   * @param column Column name to filter by
   * @param val A value to filter by
   */
  findAll(column: string, val: any): number[] {
    let indeces: number[] = [];
    _.forEach(this.values, (row: Record<string, any>, idx: number) => {
      if (row[column] == val) {
        indeces.push(idx);
      }
    });
    return indeces;
  }
  /**
   * Returns an empty RecordSet with columns copied from the current one.
   */
  cloneMetadata(): RecordSet {
    return new RecordSet(this.columns.slice(0));
  }
  /**
   * Return a copy of current RecordSet with shallow copies of values.
   */
  clone(): RecordSet {
    let values = this.values.map((row, idx) => {
      return _.clone(row);
    });
    return new RecordSet(this.columns.slice(0), values);
  }
}

export interface SdfFull {
  advertiserId: string;
  campaigns: RecordSet;
  insertionOrders: RecordSet;
  lineItems?: RecordSet;
  adGroups?: RecordSet;
  ads?: RecordSet;
}

export interface SdfRuntime {
  //campaigns: RecordSet;
  advertiserId: string;
  insertionOrders: RecordSet;
  lineItems: RecordSet;
}

