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

export function parseBool(params: any): boolean {
  return !(
    params === "false" ||
    params === "0" ||
    params === "" ||
    params === undefined
  );
};

export function parseDate(params: any): Date {
  if (_.isDate(params))
    return params;
  return new Date(params);
}

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