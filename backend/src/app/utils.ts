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