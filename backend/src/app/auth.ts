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
import { LoginTicket, OAuth2Client, TokenPayload } from "google-auth-library";
import { google } from 'googleapis';
export { LoginTicket } from 'google-auth-library';

const oAuth2Client = new OAuth2Client();

export async function verifyJwtToken(iapJwt: string, expectedAudience: string): Promise<LoginTicket> {
  // Verify the id_token, and access the claims.
  const response = await oAuth2Client.getIapPublicKeys();
  const ticket = await oAuth2Client.verifySignedJwtWithCertsAsync(
    iapJwt,
    response.pubkeys,
    expectedAudience,
    ['https://cloud.google.com/iap']
  );
  return ticket;
}

export async function verifyIdToken(token: string): Promise<TokenPayload | undefined> {
  const ticket = await oAuth2Client.verifyIdToken({
      idToken: token,
      audience: '685425631282-kisohqm6rgl36grec172pnqsn6v6ql67.apps.googleusercontent.com',
  });
  const payload = ticket.getPayload();
  //const userid = payload['sub'];
  return payload;
  // If request specified a G Suite domain:
  // const domain = payload['hd'];
}

export function getOAuth(accessToken: string): OAuth2Client {
  var auth = new OAuth2Client();
  auth.credentials = {
    access_token: accessToken
  };
  return auth;
}

export function setupOAuth(accessToken: string) {
  google.options({
    auth: getOAuth(accessToken)
  });
}