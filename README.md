# DV360 Triggerator 
Decision engine for automated managing DV360 campaigns using signals from external data feeds.

**This is not an officially supported Google product.**

## Description
The idea behind this project is automating management of campaigns in Google Display&Video 360 (DV360) using data from external sources that we call data feeds (or just feeds). DV360 doesn't allow to change programmatically all settings of campaigns through API, such as bids and frequencies. That's because this project took the approach of generating up front all combinations of Insertion Orders/Line Items/etc as a SDF (Structured Data Files) and leave it to the user to import into DV360. Later during run-time the execution engine takes a campaign created from generated SDF and enables/disables particular campaign's objects (IO/LI) for each row from feed(s).  
To decide which IOs/LIs we should enable or disable for each feed row there are rules. A rule has a condition (expression in JavaScript) which either evaluated to true or false.  
In the end after SDF is generated and imported into DV360 we have a total number of combinations of IOs and LIs equal to total number of combinations of feed's rows and rules. 
Row name (a field's value which name specified in configuration) and row name are used in templates for naming DV360 campaigns objects (IOs/LIs/AdGroups/Ads).  
The tool support both Display and TrueView (YouTube) campaigns.

## Deployment 

Basically you can run this project in any environment but this guide targets Google Cloud deployment only. Free Tier is enough for this application and you won't exceed free tier quotes if won't scale AppEngine instances.

### Prerequisites
* In the Google Cloud Console, on the project selector page, select or create a Google Cloud project.
* Make sure that billing is enabled for your Cloud project.
* Activate Cloud Console Shell and clone the repository
```
git clone https://github.com/google/triggerator.git
```

### (semi) Automated installation
Run `scripts/setup.sh` script in Cloud Shell and follow its instructions

### Manual installation
* Copy `backend/app.yaml.copy` to `backend/app.yaml`
* Create a new spreadsheet - go http://sheet.new
* Rename default sheet 'Sheet1' to 'Main'
* Share it with your project's default service account (PROJECT_ID@appspot.gserviceaccount.com)
* Copy its id from the url, for example for a spreadsheet
https://docs.google.com/spreadsheets/d/12yocZ6MCFFwXFlBKCF9eeS80WiJk04SLuFQsX9s2xUE/edit#gid=0
id will be `12yocZ6MCFFwXFlBKCF9eeS80WiJk04SLuFQsX9s2xUE`
* Paste the id into `app.yaml` file as value for `MASTER_SPREADSHEET` environment variable
* Activate the following APIs:
  * Sheets API
  * Drive API
  * Display&Video API
  * Build API
  * IAP API
* Create a new App Engine application (`gcloud app create --region europe-west`)
* Build and deploy application by running `build-n-deploy.sh` script in script folder in Cloud Shell
  * If you get an error like ERROR: (gcloud.app.deploy) NOT_FOUND: Unable to retrieve P4SA just execute publish one more time - run `gcloud app deploy` in backend folder (in Cloud Shell)
* Configure OAuth consent screeen by going to https://console.cloud.google.com/apis/credentials/consent
User type choose External). After you create the OAuth consent screen 
* Go to IAP (https://console.cloud.google.com/security/iap) and activate it for AppEngine 
* Add yourself (and any other user who needs access to the app) as members with role 'IAP-secured Web App User'
* Add your project's default service account as a user to your DV360 account
* Open the app (you can see the url by executing `gcloud app browse`)
  * If you get 'You don't have access' error just wait a bit