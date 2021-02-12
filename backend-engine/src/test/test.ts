import fs from 'fs';
import path from 'path';
import http from 'http';
import {URL} from 'url';
import open from 'open';
import _ from 'lodash';
import destroyer from 'server-destroy';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import ConfigService from '../app/config-service';
import Controller from '../app/controller';
import { FeedInfo } from '../app/config';
import {traverseObject} from '../app/feed-service';

// If modifying these scopes, delete token.json.
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

async function authorizeAsync(credentials: any): Promise<OAuth2Client> {
  const { client_secret, client_id } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, "http://127.0.0.1:3000");

  // Check if we have previously stored a token.
  let token;
  try {
    token = fs.readFileSync(TOKEN_PATH, 'utf8');
  } catch (e) {
    return getAuthenticatedClient(oAuth2Client);
  }
  oAuth2Client.setCredentials(JSON.parse(token));
  return oAuth2Client;
}

function getAuthenticatedClient(oAuth2Client: OAuth2Client): Promise<OAuth2Client> {
  return new Promise((resolve, reject) => {
    // Generate the url that will be used for the consent dialog.
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES //'https://www.googleapis.com/auth/userinfo.profile',
    });

    // Open an http server to accept the oauth callback. In this simple example, the
    // only request to our webserver is to /oauth2callback?code=<code>
    const server = http.createServer(async (req, res) => {
      console.log('Incoming request to ' + req.url);
      try {
        if (req.url && (req.url.indexOf('/oauth2callback') > -1 || req.url.startsWith('/?'))) {
          // acquire the code from the querystring, and close the web server.
          const qs = new URL(req.url, 'http://localhost:3000').searchParams;
          const code = qs.get('code');
          if (!code) {
            throw new Error('No code provided');
          }
          console.log(`Code is ${code}`);
          res.end('Authentication successful! Please return to the console.');
          server.destroy();

          // Now that we have the code, use that to acquire tokens.
          const r = await oAuth2Client.getToken(code);
          let token = r.tokens;
          // Make sure to set the credentials on the OAuth2 client.
          oAuth2Client.setCredentials(token);
          console.info('Tokens acquired: ' + token);

          // Store the token to disk for later program executions
          fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
            if (err) return console.error(err);
            console.log('Token stored to', TOKEN_PATH);
          });

          resolve(oAuth2Client);
        }
      } catch (e) {
        console.log(e);
        reject(e);
      }
    }).listen(3000, () => {
      console.log('Listening on 127.0.0.1:3000 and waiting for callback');
      // open the browser to the authorize url to start the workflow
      console.log('Navigate to:\n' + authorizeUrl);
      open(authorizeUrl, { wait: false }).then(cp => cp.unref());
    });
    destroyer(server);
  });
}

//const credentials = require('credentials.json');
async function main() {

  
  // ConfigService tests
/*
  // Authorize a client with credentials, then call the Google Sheets API.
  let credentials = JSON.parse(fs.readFileSync('credentials.json', 'utf8'));
  let auth = await authorizeAsync(credentials);
  google.options({
    auth: auth
  });
  
  const spreadsheetId = '1Zf5MpraZTY8kWPm8is6tAAcywsIc3P-X_acwIwXRAhs';
  let configService = new ConfigService(spreadsheetId);
  //let controller = new Controller(configService);
  //await controller.run();
  let config = await configService.load();
  console.log(JSON.stringify(config));
*/


  //let data = await feedService.loadFeed(config.feedInfo.feeds[1]);
  //console.log(JSON.stringify(data));
}

main().catch(console.error);
