import fs from 'fs';
import path from 'path';
import { authorizeAsync } from './auth';
let argv = require('yargs/yargs')(process.argv.slice(2)).argv;

let cred_file = argv.credentials || 'credentials.json';
if (!fs.existsSync(cred_file)) {
  cred_file = path.resolve(__dirname, cred_file);
}

let credentials = JSON.parse(fs.readFileSync(cred_file, 'utf8'));
authorizeAsync(credentials, true).catch(console.error);
