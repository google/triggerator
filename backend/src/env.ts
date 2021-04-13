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
let argv = require('yargs/yargs')(process.argv.slice(2)).argv;

export const STATIC_DIR = argv.staticDir || process.env.STATIC_DIR || 'static';
export const PORT = argv.port || process.env.PORT || 8080;
export const HEALTH_CHECK_URL = argv.healthCheckUrl || process.env.HEALTH_CHECK_URL || '/_ah/health';
// Supported values: IAP (Identity-Aware Proxy), CLIENT (auth tokens in Authotization header):
export const SECURITY = argv.security || process.env.SECURITY || 'CLIENT';

// applicabale for SECURITY=='IAP', it's a value from 'Signed Header JWT Audience' 
// on https://console.cloud.google.com/security/iap?project=YOUR_PROJECT
// See https://cloud.google.com/iap/docs/signed-headers-howto#verifying_the_jwt_payload
export const EXPECTED_AUDIENCE = argv.expectedAudience || process.env.EXPECTED_AUDIENCE;

export const MASTER_SPREADSHEET = argv.masterSpreadsheet || process.env.MASTER_SPREADSHEET;

export const IS_GAE = !!process.env.GAE_APPLICATION;

export const GAE_LOCATION = "europe-west1";

export function getTempDir() {
  if (IS_GAE)
    return '/tmp';
  else
    return '.tmp';
}

export const SERVICE_ACCOUNT = IS_GAE ? process.env.GOOGLE_CLOUD_PROJECT + '@appspot.gserviceaccount.com' : ''