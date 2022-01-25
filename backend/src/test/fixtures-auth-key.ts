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
import path from 'path';
import { google } from 'googleapis';
import { OAUTH_SCOPES } from '../consts';

export function mochaGlobalSetup() {
  let file = path.resolve('./keys/triggerator-sd-sa.json');
  const auth = new google.auth.GoogleAuth({
    keyFile: file,
    scopes: OAUTH_SCOPES
  });
  console.log(`Using service account key file: ` + file);
  google.options({
    auth: auth
  });
}