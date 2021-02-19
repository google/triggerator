import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';
const basepath = path.resolve(__dirname);

async function authorizeAsync(credentials: any): Promise<OAuth2Client> {
  const { client_secret, client_id } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, "http://127.0.0.1:3000");

  // Check if we have previously stored a token.
  let token;
  try {
    token = fs.readFileSync(path.join(basepath,TOKEN_PATH), 'utf8');
  } catch (e) {
    throw new Error('Please execute generate-token.js interactively to generate a token file for OAuth');
    //return getAuthenticatedClient(oAuth2Client);
  }
  oAuth2Client.setCredentials(JSON.parse(token));
  return oAuth2Client;
}

export async function mochaGlobalSetup() {
  // Authorize a client with credentials, then call the Google Sheets API.
  let credentials = JSON.parse(fs.readFileSync(path.join(basepath,'credentials.json'), 'utf8'));
  let auth = await authorizeAsync(credentials);
  google.options({
    auth: auth
  });
}