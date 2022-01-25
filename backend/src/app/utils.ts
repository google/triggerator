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

/*
export function traverseObject(object: any,
  visitor: (name: string, value: any, path: string[], object: Object) => void,
  path: string[]
): boolean {
  path = path || [];
  return _.forIn(object, function (value: any, name: string) {
    path.push(name);
    if (_.isPlainObject(value)) {
      traverseObject(value, visitor, path);
    } else if (value === null || value === undefined || _.isString(value) || _.isNumber(value) || _.isBoolean(value)) {
      visitor(name, value, path, object);
    } else if (_.isArray(value)) {
      for (const idx in value) {
        path.push(idx);
        traverseObject(value[idx], visitor, path);
        path.pop();
      }
    }
    path.pop();
  });
}
 */

/**
 * Parses numbers from strings
 * @param str a string containing a number
 * @returns a finite number (never returns NaN) or undefined
 */
export function tryParseNumber(str: any): number | undefined {
  if (_.isFinite(str))
    return <number>str;
  if (str !== null) {
    if (str.length > 0) {
      if (!isNaN(str)) {
        let num = Number(str);
        return isNaN(num) ? undefined : num;
      }
    }
  }
}

/**
 * Parses boolean arguments from url (e.g. &start=true)
 * @param params A value from url
 * @returns a boolean or undefined
 */
export function parseBool(params: any): boolean {
  return !(
    !params ||
    params.toLowerCase() === "false" ||
    params === "0" ||
    params === "null" ||
    params === "undefined"
  );
};

/**
 * Parses date/datetime arguments from url (e.g. &startDate=2021-06-01)
 * @param params A value from url
 * @returns a Date or underfined
 */
export function parseDate(params: any): Date | undefined {
  if (_.isDate(params))
    return params;
  if (!isNaN(Date.parse(params)))
    return new Date(params);
  return undefined;
}

export function parseString(params: any): string | undefined {
  if (!params || params === 'undefined' || params === 'null')
    return undefined;
  return params;
}

/**
 * Compares two object and returns a difference as a new obejct
 * @param object An object being compared with the base
 * @param base A baseline object to compare with
 * @returns a new object containing fields of `object` that are absent in `base` (recursively)
 */
export function difference(object: any, base: any) {
  function changes(object: any, base: any) {
    return _.transform(object, function (result: any, value, key) {
      if (!_.isEqual(value, base[key])) {
        result[key] = (_.isObject(value) && _.isObject(base[key])) ? changes(value, base[key]) : value;
      }
    });
  }
  return changes(object, base);
}

/**
 * Returns a timestamp like 20211231T235959001 for 2021-12-31 23:59:59.001, that can be used in file names
 * @returns a string with a timestamp of current date/time
 */
export function getCurrentDateTimestamp() {
  return new Date().toISOString().replace(/\-/g, "").replace(/\:/g, "").replace(".", "");
}