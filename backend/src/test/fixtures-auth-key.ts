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