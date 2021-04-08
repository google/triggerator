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