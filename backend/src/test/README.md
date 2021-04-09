# Unit tests

The project uses Mocha framework for unit testing.
For test coverage Istanbul is used. Specifically its cli tool `nyc` (https://github.com/istanbuljs/nyc).
Mocha support several patterns (called "interfaces") for writing tests, the project uses TTD (`suite`, `test` functions).

## API auth
Some (many) tests require authentication for APIs accessing (Sheet, GCS, DV360, etc). 
There's a module `fixtures.ts` containing a Mocha global setup function (`mochaGlobalSetup`) 
that installs auth client for googleapis library globally. For this it reads `credentials.json` file 
with client_id and client_secret exported from a GCP project (generate a new OAuth 2.0 Client ID on 
console.cloud.google.com/apis/credentials) and `token.json`.
To generate `token.json` we need to run `node dist/test/generate-token.js`.

Note: files are being searched for relatively to Node's `__dir`. It's important as you can run Mocha tests as js or as ts, in each case the files will be searched for in different places (src/test for TS and dist/test for JS).

## How to run

First of all make sure you generated OAuth access token in `token.json` and placed it in a proper folder (see [API auth](#API-auth)).

You can run either ts-modules or js-modules in Mocha. In the former case you need to import ts-node/register. 
```
mocha --ui tdd --require ts-node/register --require src/test/fixtures.ts --timeout 10s src/test/**/*.ts
```
For running js-modules:
```
mocha --ui tdd --require dist/test/fixtures.js --timeout 10s src/test/**/*.js
```

fixture module is needed for setting up auth globally.
`--ui tdd` specified tdd interface (imports `suite` and `test` function in global context).

See npm scripts in package.json for shorhands:
* "test"
* "test:coverage"
* "test:prod"
