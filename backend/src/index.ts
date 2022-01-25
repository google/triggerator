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
import { PORT, IS_GAE } from './env';
import argv from './argv';
if (IS_GAE) {
  require('@google-cloud/debug-agent').start({ serviceContext: { enableCanary: false } });
}
import { google } from 'googleapis';
import { OAUTH_SCOPES } from './consts';
import createApp from './app';
import { getProjectId } from './app/cloud-utils';

async function mainServer() {
  // NOTE: setup authetication for server-to-server communication
  // (i.e. accessing other GCP services)
  // If keyFile provided then we'll use the specified service account, otherwise
  // we'll use so called Application Default Credentials (see https://github.com/googleapis/google-auth-library-nodejs#choosing-the-correct-credential-type-automatically)
  // NOTE: for running server under a user account (it's possible) see code in test/test.ts,fixture.ts,auth.ts (it requires a OAuth flow)
  let keyFile = argv.keyFile;
  // NOTE: we should set up google.options with auth in any way (even without keyFile),
  //       otherwise accessing APIs will fail with "The request is missing a valid API key" error
  const auth = new google.auth.GoogleAuth({
    keyFile: keyFile,
    scopes: OAUTH_SCOPES
  });
  google.options({
    auth: auth
  });

  const projectId = await getProjectId();
  const app = await createApp();
  app.listen(PORT, () => {
    console.log(`Web server is listening on ${PORT}, NODE_ENV = '${process.env.NODE_ENV}', GCP project id = '${projectId}'`);
  });
}

mainServer().catch(console.error);