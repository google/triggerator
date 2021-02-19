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

export function setupOAuth(accessToken: string) {
  var auth = new OAuth2Client();
  auth.credentials = {
    access_token: accessToken
  };
  google.options({
    auth: auth
  });  
}