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
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import express from 'express';
import winston from 'winston';
import router from '../api';
import { getTempDir } from '../env';

function httpGet(port: number, requestPath: string): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port,
        path: requestPath,
      },
      (res: http.IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.on('error', reject);
  });
}

suite('API /config/:id/sdf/download (path traversal protection)', function () {
  let server: http.Server;
  let port: number;
  let origCwd: string;
  let sandboxRoot: string;
  let tempDir: string;
  let outsideCanaryFile: string;

  setup(async function () {
    origCwd = process.cwd();
    sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'triggerator-sdf-test-'));
    process.chdir(sandboxRoot);

    tempDir = path.resolve(getTempDir());
    fs.mkdirSync(path.join(tempDir, 'nested'), { recursive: true });

    outsideCanaryFile = path.join(sandboxRoot, 'outside-canary.txt');
    fs.writeFileSync(outsideCanaryFile, 'OUTSIDE_CANARY_SECRET\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'legit-sdf.csv'), 'LEGIT_SDF_CONTENT_OK\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'sdf-20261109T231500000Z.zip'), 'PK_DUMMY_ZIP_DATA', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'nested', 'inner.csv'), 'NESTED_SECRET\n', 'utf8');
    fs.symlinkSync(outsideCanaryFile, path.join(tempDir, 'symlink-sdf.csv'));

    const app = express();
    const silentLogger = winston.createLogger({ silent: true });
    app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
      req.log = silentLogger;
      next();
    });
    app.use('/api/v1', router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  teardown(async function () {
    process.chdir(origCwd);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (sandboxRoot && fs.existsSync(sandboxRoot)) {
      fs.rmSync(sandboxRoot, { recursive: true, force: true });
    }
  });

  test('downloads legitimate CSV file directly inside getTempDir()', async function () {
    const csvRes = await httpGet(port, '/api/v1/config/cfg1/sdf/download?file=legit-sdf.csv');

    assert.strictEqual(csvRes.statusCode, 200);
    assert.strictEqual(csvRes.body, 'LEGIT_SDF_CONTENT_OK\n');
    assert.strictEqual(csvRes.headers['access-control-expose-headers'], 'Content-Disposition');
    assert.ok(
      String(csvRes.headers['content-disposition'] || '').includes('legit-sdf.csv'),
      'Expected Content-Disposition attachment filename'
    );
  });

  test('downloads legitimate SDF zip archive directly inside getTempDir()', async function () {
    const zipRes = await httpGet(port, '/api/v1/config/cfg1/sdf/download?file=sdf-20261109T231500000Z.zip');

    assert.strictEqual(zipRes.statusCode, 200);
    assert.strictEqual(zipRes.body, 'PK_DUMMY_ZIP_DATA');
  });

  test('returns 400 when file query parameter is omitted', async function () {
    const res = await httpGet(port, '/api/v1/config/cfg1/sdf/download');

    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(JSON.parse(res.body), { error: "file parameter wasn't specified" });
  });

  test('returns 400 when file query parameter is empty', async function () {
    const res = await httpGet(port, '/api/v1/config/cfg1/sdf/download?file=');

    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(JSON.parse(res.body), { error: "file parameter wasn't specified" });
  });

  const rejectedCases: Array<[string, () => string]> = [
    ['relative parent traversal ../outside-canary.txt', () => `?file=${encodeURIComponent('../outside-canary.txt')}`],
    ['deep relative traversal ../../../../../../etc/passwd', () => `?file=${encodeURIComponent('../../../../../../etc/passwd')}`],
    ['URL-encoded slash traversal ..%2Foutside-canary.txt', () => '?file=..%2Foutside-canary.txt'],
    ['absolute path outside tempDir', () => `?file=${encodeURIComponent(outsideCanaryFile)}`],
    ['dot current-directory segment', () => '?file=.'],
    ['double-dot parent-directory segment', () => '?file=..'],
    ['nested subdirectory path nested/inner.csv', () => `?file=${encodeURIComponent('nested/inner.csv')}`],
    ['backslash path separator ..\\outside-canary.txt', () => `?file=${encodeURIComponent('..\\outside-canary.txt')}`],
    ['embedded null byte legit-sdf.csv%00.zip', () => '?file=legit-sdf.csv%00.zip'],
    ['symlink inside tempDir pointing outside tempDir', () => '?file=symlink-sdf.csv'],
    ['directory entry inside tempDir', () => '?file=nested'],
    ['array query parameter ?file[]=...', () => '?file[]=legit-sdf.csv&file[]=other.csv'],
    ['object query parameter ?file[a]=...', () => '?file[a]=legit-sdf.csv'],
  ];

  for (const [label, buildQuery] of rejectedCases) {
    test(`rejects ${label} with 400`, async function () {
      const query = buildQuery();

      const res = await httpGet(port, `/api/v1/config/cfg1/sdf/download${query}`);

      assert.strictEqual(res.statusCode, 400);
      assert.ok(!res.body.includes('OUTSIDE_CANARY_SECRET'));
      assert.ok(!res.body.includes('NESTED_SECRET'));
      assert.deepStrictEqual(JSON.parse(res.body), { error: 'invalid file parameter' });
    });
  }

  test('returns 404 without hanging when requested file does not exist inside getTempDir()', async function () {
    const res = await httpGet(port, '/api/v1/config/cfg1/sdf/download?file=missing-sdf.zip');

    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(JSON.parse(res.body), { error: 'SDF file not found' });
  });
});
