# DV360 Triggerator 
Decision engine for automated managing DV360 campaigns using signals from external data feeds.

**This is not an officially supported Google product.**

## Description
The idea behind this project is automating management of campaigns in Google Display&Video 360 (DV360) using data from external sources that we call data feeds (or just feeds). DV360 doesn't allow to change programmatically all settings of campaigns through API, such as bids and frequencies. That's because this project took the approach of generating up front all combinations of Insertion Orders/Line Items/etc as a SDF (Structured Data Files) and leave it to the user to import into DV360. Later during run-time the execution engine takes a campaign created from generated SDF and enables/disables particular campaign's objects (IO/LI) for each row from feed(s).  
To decide which IOs/LIs should be enabled or disabled for each feed row the
decision engine uses rules. A rule has a condition (expression in JavaScript) which either evaluated to true or false.  
In the end after SDF is generated and imported into DV360 we have a total number of combinations of IOs and LIs equal to total number of combinations of feed's rows and rules.  
Row name (a field's value which name specified in configuration) and rule name are used in templates for naming DV360 campaigns objects (IOs/LIs/AdGroups/Ads).  
The tool support both Display and TrueView (YouTube) campaigns.

## Deployment 

Basically you can run this project in any environment but this guide targets Google Cloud deployment only. Free Tier is enough for this application and you won't exceed free tier quotes if you don't scale AppEngine instances.

### Prerequisites
* In the Google Cloud Console, on the project selector page, select or create a Google Cloud project
* Make sure that billing is enabled for your Cloud project
* Activate Cloud Console Shell and clone the repository
```
git clone https://github.com/google/triggerator.git
```
or use this wizard:  
[![Try It In Google Cloud Shell](http://gstatic.com/cloudssh/images/open-btn.svg)](https://console.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https%3A%2F%2Fgithub.com%2Fgoogle%2Ftriggerator&cloudshell_tutorial=README.md)  
(in this case we'll need to choose a project after the repository is cloned - `gcloud config set project YOUR_PROJECT`)


### Automated installation
Run `scripts/setup.sh` script in Cloud Shell within the cloned repository. 

Please note that currently `setup.sh` works only on Linux (won't work on MacOS). You can run it from your local machine (just set your project `gcloud config set project PROJECT_ID` and login `glcloud auth login` as a project owner/editor), but it was not tested much. So running the script in Cloud Shell is a recommended approached.

You still need to add application service account (PROJECT_ID@appspot.gserviceaccount.com) to your DV360 account manually.

Open the app (you can see the url by executing `gcloud app browse`). If you get 'You don't have access' error just wait a little bit and retry.


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
  * Sheets API: `gcloud services enable sheets.googleapis.com`
  * Drive API: `gcloud services enable drive.googleapis.com`
  * Display&Video API: `gcloud services enable displayvideo.googleapis.com`
  * Cloud Build API: `gcloud services enable cloudbuild.googleapis.com`
  * Cloud Resource Manager API: `gcloud services enable cloudresourcemanager.googleapis.com`
  * IAP API: `gcloud services enable iap.googleapis.com`
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


## Updating
Basically we just need to update source code (`git pull`) and redeploy (`gcloud app deploy`). But before doing this please check CHANGELOG.md for any breaking changes.
There is no published artifacts anywhere for the solution so there's no a strict notion of release. But since the v1 the project maintainers are going to track all significant changes (especially breaking ones if they happen) and features in CHANGELOG.md and update `version` field in `package.json` files for backend and frontend. 


## Architecture
The solution is a classic web application with front-end built in Angular (11+) and backend for NodeJS built with TypeScript and Express. The backend is supposed to be deployed to Google App Engine

Backend app doesn't have any authentication, nor any user management. For this the solution solely rely on Identity-Aware Proxy. It's a GCP service for shielding cloud apps with authentication. 

Please note that IAP manages user access with its own roles. So even project owner won't have access to a shielded app by default. To allow access for a user you need to go to IAP page in your GCP project - 
https://console.cloud.google.com/security/iap and add a member with 'IAP-secured Web App User' role. If you installed app with setup.sh script  it's already done for you, but you need to add members for all other users. You can allow access for everyone by adding "allUsers" or "allAuthenticatedUsers" as a member with the IAP role, but obviously it's not recommended from security point of view.

Another thing that makes the application to depend on Google Cloud services is the usage of Cloud Scheduler. Backend create Cloud Scheduler jobs for automated engine execution. Please note that in that cases when the backend is being called by Scheduler requests are bypassing IAP.


## License

Apache Version 2.0

See [LICENSE](https://github.com/google/triggerator/blob/master/LICENSE)