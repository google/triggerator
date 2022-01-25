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
import fs from 'fs';
import http from 'http';
import {URL} from 'url';
import open from 'open';
import destroyer from 'server-destroy';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { OAUTH_SCOPES } from '../consts';

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

export async function authorizeAsync(credentials: any, reauthenticate?: boolean): Promise<OAuth2Client> {
  const { client_secret, client_id } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, "http://127.0.0.1:3000");

  // Check if we have previously stored a token.
  let token;
  if (reauthenticate) {
    return getAuthenticatedClient(oAuth2Client);
  }
  try {
    token = fs.readFileSync(TOKEN_PATH, 'utf8');
  } catch (e) {
    return getAuthenticatedClient(oAuth2Client);
  }
  oAuth2Client.setCredentials(JSON.parse(token));
  return oAuth2Client;
}

export function getAuthenticatedClient(oAuth2Client: OAuth2Client): Promise<OAuth2Client> {
  return new Promise((resolve, reject) => {
    // Generate the url that will be used for the consent dialog.
    const authorizeUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: OAUTH_SCOPES
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
          console.info('Token acquired: ' + token);

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