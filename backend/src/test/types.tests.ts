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
import assert from 'assert';
import { FeedData, RecordSet } from "../types/types";
import csv_parse from 'csv-parse/lib/sync';

suite('RecordSet', function () {

  test('Creating RecordSet with empty array fails', function () {
    assert.throws(() => RecordSet.fromValues([]))
  });

  test('Creating RecordSet with array containing non-object fails', function () {
    assert.throws(() => RecordSet.fromValues([<any>1, "2"]))
  })

  test('Adding and updating rows', function () {
    let rs = RecordSet.fromValues([{ name: "obj1" }]);
    rs.addRow({ name: "obj2" })
    assert.deepStrictEqual(rs.values, [{ name: "obj1" }, { name: "obj2" }]);
    rs.updateRow(0, { name: "obj3" });
    assert.deepStrictEqual(rs.values, [{ name: "obj3" }, { name: "obj2" }]);
    rs.updateRow(-1, { name: "obj4" });
    assert.deepStrictEqual(rs.values, [{ name: "obj3" }, { name: "obj4" }]);
    assert.strictEqual(rs.rowCount, 2);
    rs.removeRow(0);
    assert.strictEqual(rs.rowCount, 1);
    rs.removeRow(-1);
    assert.strictEqual(rs.rowCount, 0);
    assert.deepStrictEqual(rs.values, []);
  })

  test('Getting and setting', function () {
    let rs = RecordSet.fromValues([{ name: null }, { name: "obj2" }]);
    rs.set("name", 0, "obj1");
    rs.set("name", -1, "obj2");
    assert.deepStrictEqual(rs.values, [{ name: "obj1" }, { name: "obj2" }]);
    assert.deepStrictEqual(rs.get("name", 0), "obj1");
    assert.deepStrictEqual(rs.get("name", -1), "obj2");
    assert.deepStrictEqual(rs.get("name", -2), "obj1");
    assert.deepStrictEqual(rs.getRow(0, "name"), { name: "obj1" });

    let idx = rs.addRow({ col1: "val1", col2: "val2", col3: "val3" });
    assert.deepStrictEqual(rs.getRow(idx, "col2"), { col2: "val2" });
  });

  test('findAll', function () {
    let rs = RecordSet.fromValues([
      { name: "obj1", group: 1 },
      { name: "obj2", group: 1 },
      { name: "obj3", group: 2 },
    ]);
    let indecies = rs.findAll("group", 1);
    assert.deepStrictEqual(indecies, [0, 1]);
  });

  test('cloning', function () {
    let rs1 = RecordSet.fromValues([
      { name: "obj1", group: 1 },
      { name: "obj2", group: 1 },
    ]);
    let rs2 = rs1.clone();
    assert.deepStrictEqual(rs2.values, rs1.values);

    let rs3 = rs1.cloneMetadata();
    assert.strictEqual(rs3.rowCount, 0);
  });
});

suite('FeedData', function () {
  test('constructing with parseNumber', function () {
    let strData = "column1,column2,column3,column4\n" +
      "value1,value2,100,";
    const csv = csv_parse(strData, {
      columns: true,
      skip_empty_lines: true
    });
    let data = new FeedData(csv, 'parseNumbers');
    assert.deepStrictEqual(data.getRow(0), { column1: "value1", column2: "value2", column3: 100, column4: '' });
  })
});