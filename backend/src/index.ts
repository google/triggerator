let argv = require('yargs/yargs')(process.argv.slice(2)).argv;
import { google } from 'googleapis';
import { PORT } from './env';
import { OAUTH_SCOPES } from './consts';
import app from './app';

async function mainServer() {
  // NOTE: setup authetication for server-to-server communication 
  // (i.e. accessing other GCP services)
  // If keyFile provided then we'll use the specified service account, otherwise
  // we'll use so called Application Default Credentials (see https://github.com/googleapis/google-auth-library-nodejs#choosing-the-correct-credential-type-automatically)
  // NOTE: for running server under a user account (it's possible) see code in test/test.ts,fixture.ts,auth.ts (it requires a OAuth flow)
  let keyFile = argv.keyFile;
  const auth = await new google.auth.GoogleAuth({
    keyFile: keyFile,
    scopes: OAUTH_SCOPES
  });
  google.options({
    auth: auth
  });

  app.listen(PORT, () => {
    console.log(`Web server is listening on ${PORT}`)
  });
}

mainServer().catch(console.error);