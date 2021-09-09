# DV360 Triggerator
Decision engine for automated managing DV360 campaigns using signals from external data feeds.

**This is not an officially supported Google product.**


## Description
The idea behind this project is automating management of campaigns in Google Display&Video 360 (DV360) using data from external sources that we call *data feeds* (or just *feeds*). DV360 doesn't allow to change programmatically all settings of campaigns through API. This project takes an approach of generating ad campaigns up front with all possible combinations of Insertion Orders/Line Items/etc in a form of SDF (Structured Data Files) which should be imported into DV360 manually by the user. Later during runtime the execution engine takes a campaign created from generated SDF and enables/disables particular campaign's objects (IO/LI) for each row from feed(s).
To decide which IOs/LIs should be enabled or disabled for each feed row the decision engine uses rules. A rule has a condition (expression in JavaScript) which is either evaluated to true or false. Enabling a IO/LI corresponding to a rule means that we apply bid, frequency and creatives that were assigned with that LI during the generation phase.
With Triggerator scheduled to run periodically (it uses Cloud Scheduler for this) clients can dynamically adjust their ad campaigns based on external signals, such as weather, disease level, traffic, UV factor, inventory balances, etc.
The tool supports both Display and TrueView (YouTube) campaigns.


## Deployment

Basically you can run this project in any environment but this guide targets Google Cloud deployment only. Free Tier is enough for this application and you won't exceed free tier quotes if you don't scale AppEngine instances.

### Prerequisites
* In the Google Cloud Console, on the project selector page, select or create a Google Cloud project
* Make sure that billing is enabled for your Cloud project, see [Enable, disable, or change billing for a project](https://cloud.google.com/billing/docs/how-to/modify-project) for details
* Make sure you have Owner role in the project (or Editor and two AppEngine specific roles: appengine.appAdmin и appengine.appCreator - see https://cloud.google.com/appengine/docs/standard/python/roles)
* Activate Cloud Console Shell and clone the repository
```
git clone https://github.com/google/triggerator.git
```
or use this wizard:
[![Try It In Google Cloud Shell](http://gstatic.com/cloudssh/images/open-btn.svg)](https://console.cloud.google.com/cloudshell/editor?cloudshell_git_repo=https%3A%2F%2Fgithub.com%2Fgoogle%2Ftriggerator&cloudshell_tutorial=README.md)
(in this case we'll need to choose a project after the repository is cloned - `gcloud config set project YOUR_PROJECT`)

Whatever installation method you use you'll need to add your application service account (PROJECT_ID@appspot.gserviceaccount.com) to your DV360 account manually (Standard role should be enough). See details in [Manage users in Display & Video 360](https://support.google.com/displayvideo/answer/2723011).


### Automated installation
#### Limitations

* The instructions below must be run within a Google Cloud Organization by a member of that org. This is due to the use of `gcloud alpha iap oauth-brand` commands - which implicity operate on internal brands. For details see https://cloud.google.com/iap/docs/programmatic-oauth-clients

>NOTE: if you're running the setup script  outside a Cloud Orginization most likely you'll get an error on step "Creating oauth brand (consent screen) for IAP" (see below). To workaround the error you'll have to create a OAuth consent screen manually and then enable IAP for App Engine app. Please see Manual Installation procedure for details.

    "create-oauth-client": ERROR: (gcloud.alpha.iap.oauth-brands.list) INVALID_ARGUMENT: Request contains an invalid argument.


Go to `scripts` folder of the cloned repository (`cd triggerator/scripts`) and run `./setup.sh` script in Cloud Shell.

> Please note that currently `setup.sh` works only on Linux (i.e. won't work on MacOS). You can run it from your local machine (just set your project `gcloud config set project PROJECT_ID` and login `glcloud auth login` as a project owner/editor), but it was not tested much. So running the script in Cloud Shell is the recommended approach.

Open the app (you can see the url by executing `gcloud app browse`). If you get 'You don't have access' error just wait a little bit and retry.

Unfortunetely there could be an error during deployement to App Engine right after creation and the install script can hit that issue. It looks like :

> ERROR: (gcloud.app.deploy) NOT_FOUND: Unable to retrieve P4SA: [your-project@gcp-gae-service.iam.gserviceaccount.com] from GAIA. Could be GAIA propagation delay or request from deleted apps.

In such a case if there was not any other errors you can just redeploy application. For this go to 'backend' folder (`cd ../backend` if you are in `scripts` folder) and run `gcloud app deploy -q`.

#### Customization
`setup.sh` support several command line arguments with which you can customize defaults:
* `-m` | `--masterdoc` - A Google Spreadsheet Id to use as a master doc (it'll be created if omitted), do not forget to share it with AppEngine's service account
* `-l` | `--location` - location region for App Engine applicatoin, please note that despite other GCP services GAE supports only two regions: `europe-west` and `us-central`. Default is `europe-west`
* `-t` | `--title` - title for OAuth consent screen. Default is 'Triggerator'
* `-u` | `--user` - user email to be shown as contact of OAuth consent screen. Default is the current user's email


### Manual installation

* Copy `backend/app.yaml.copy` to `backend/app.yaml`
* Create a new spreadsheet - go http://sheet.new
* Rename default sheet 'Sheet1' to 'Main'
* Share it with your project's default service account (PROJECT_ID@appspot.gserviceaccount.com)
* Copy its id from the url, for example for a spreadsheet
https://docs.google.com/spreadsheets/d/12yocZ6MCFFwXFlBKCF9eeS80WiJk04SLuFQsX9s2xUE/edit#gid=0
id will be `12yocZ6MCFFwXFlBKCF9eeS80WiJk04SLuFQsX9s2xUE`
* Paste the id into `backend/app.yaml` file as value for `MASTER_SPREADSHEET` environment variable
* Activate the following APIs:
  * Sheets API: `gcloud services enable sheets.googleapis.com`
  * Drive API: `gcloud services enable drive.googleapis.com`
  * Display&Video API: `gcloud services enable displayvideo.googleapis.com`
  * Cloud Build API: `gcloud services enable cloudbuild.googleapis.com`
  * Cloud Resource Manager API: `gcloud services enable cloudresourcemanager.googleapis.com`
  * IAP API: `gcloud services enable iap.googleapis.com`
  * App Engine Admin API `gcloud services appengine.googleapis.com`
* Create a new App Engine application (`gcloud app create --region europe-west`)
* Build and deploy application by running `build-n-deploy.sh` script in `scripts` folder in Cloud Shell
  * If you get an error like ERROR: (gcloud.app.deploy) NOT_FOUND: Unable to retrieve P4SA just execute publish one more time - run `gcloud app deploy` in backend folder (in Cloud Shell)
* Configure OAuth consent screeen by going to https://console.cloud.google.com/apis/credentials/consent
(for User type choose External).
* Go to IAP (https://console.cloud.google.com/security/iap) and activate it for AppEngine
* Add yourself (and any other user who needs access to the app) as members with role 'IAP-secured Web App User' (you can use Google Workspace (Suite previously) domains or Google Group)
* Add your project's default service account as a user to your DV360 account
* Open the app (you can see the url by executing `gcloud app browse`)
  * If you get 'You don't have access' error just wait a bit


### Email notifications
You can setup sending email notifications on executions started by Cloud Scheduler.
The server app uses [Nodemailer](https://nodemailer.com/smtp/) for sending emails via SMTP. That means that you can use any mail service provider that supports SMTP.
Please check this guide https://cloud.google.com/compute/docs/tutorials/sending-mail for details about any restrictions for outbound SMTP traffic in GCP. But if you use a standard port, such as 587, you're good.

Configuration for Nodemailer is taken from a json file which path is expected in environment variable `MAILER_CONFIG_PATH`. The path is resolved relatively to application root folder (a folder with `package.json`).

Each configuration for ad campaigns contain their own email(s) for notifications.

The following is an example for Mailgun:

in your `app.yaml`:
```yaml
  MAILER_CONFIG_PATH: './mailer.json'
```

In `mailer.json` (besides app.yaml):
```json
{
  "host": "smtp.eu.mailgun.org",
  "port": 587,
  "auth": {
    "user": "postmaster@YOUR_DOMAIN",
    "pass": "YOUR_PASSWORD"
  },
  "from": "no-reply@YOUR_DOMAIN"
}
```
Please note in Mailgun you can use Free plan but have to add a credit card and verify a domain.

In contrast in Sendgrid you don't have to add any credit card or verify a domain. You just need to validate an email.
```json
{
  "host": "smtp.sendgrid.net",
  "port": 587,
  "auth": {
    "user": "apikey",
    "pass": "YOUR_PASSWORD"
  },
  "from": "YOUR_VALIDATED_EMAIL"
}
```


## Updating
Basically you just need to update source code (execute `git pull` in the cloned repositoty folder), rebuild and redeploy (run `build-n-deploy.sh` in `scripts` folder). But before doing this please check [CHANGELOG.md](https://github.com/google/triggerator/blob/main/CHANGELOG.md) for any breaking changes.
Also please note that the only files you are supposed to changed (`app.yaml`, `mailer.json`) are not tracked by Git so you are safe to update from upstream. If it's not the case please proceed accordantly (e.g. do git stash `git stash` and `git stash pop` after the repository is updated).
When you build the application from sources (and you do) there could be a case that `package-lock.json` will be slightly different that ones in the repository. This is not important but requires you to do reset (i.e. discard all local changes).

So in general these commands should be sifficient for updating the application (or just run `update.sh` script in `scripts` folder):
```shell
git fetch
git reset --hard origin/main
cd scripts
./build-n-deploy.sh
```

But if you are going to update your application from a different machine or by different person from within its Cloud Shell it won't work because your newly cloned repository doesn't have `app.yaml` of your application (that was generated/created during installation). And running `setup.sh` again against a project with deployed application is not a good idea (you will lose your data). So what you need to do instead is to get `app.yaml` from place/person who did the initial installation. To simplify this process `setup.sh` copies `app.yaml` to a GCS bucket called "$PROJECT_ID-setup" and `update.sh` takes it from there if there's no local app.yaml. So it's recommended to use `update.sh` for updating applications.

There is no published artifacts anywhere for the solution so currently there's no a strict notion of *release*. But since the v1 the project maintainers are tracking all significant changes (especially breaking ones if they happen) and features in `CHANGELOG.md` and update `version` field in `package.json` files for backend and frontend.


## Architecture
The solution is a classic web application with front-end built in Angular (11+) and backend on NodeJS built with TypeScript and Express. The backend is supposed to be deployed to Google App Engine.

Backend app doesn't have any authentication, nor any user management. For this the solution solely relies on Identity-Aware Proxy (IAP). It's a Google Cloud service for shielding cloud apps with authentication.

Please note that IAP manages user access with its own roles. So even the project owner won't have access to a shielded app by default. To allow access for a user you need to go to IAP page in your GCP project -
https://console.cloud.google.com/security/iap and add a member with 'IAP-secured Web App User' role. If you installed app with `setup.sh` script  it's already done for you, but you might need to add members for all other users. You can allow access for everyone by adding "allUsers" or "allAuthenticatedUsers" as a member with the IAP role, but obviously it's not recommended from security point of view.

Also you can create a member for a Google Workspace domain or a Google Group.

Another thing that makes the application to depend on Google Cloud services is the usage of Cloud Scheduler. Backend creates Cloud Scheduler jobs for automated engine execution. Please note that in that case when the backend is being called by Scheduler, requests are bypassing IAP.

### Where is the data
The application does not use any database. Instead all data is kept in Google Spreadsheets. During installation you create a so-called master spreadsheet (its id is put into `app.yaml` as an environment variable available to the backend in runtime). Then when you create a new application (or configuration) effectively you create a new spreadsheet, which id is put into the master spreadsheet. That's it.

### GAE environemnt, instance class, scaling and costs

There are two type of environment in GAE: standard and flexible. See https://cloud.google.com/appengine/docs/the-appengine-environments
As flexibile environment doesn't provide Free Tier we use standard. But you can manually change the environemnt in your `app.yaml`. Standard environment allows to scale down to 0 running instances when the application is not in use.

There are several types of scaling in standard environment. By default automatic scaling is used. Different scaling type have [different characterictics](https://cloud.google.com/appengine/docs/standard/nodejs/how-instances-are-managed#scaling_types). For this solution the most important one is *request timeout*. During main execution there will lots of calls to DV360 API (to enable/disable IO/LI) and the API is quite slow. So one execution can last quite long.
Request timeouts are following:
* Automatic scaling : 10 minutes
* Basic/manual scaling: 24 hours

Usually 10 minutes is not enough. That because by default basic scalling is used and the template for `app.yaml` contains `basic_scaling` section:
```yaml
runtime: nodejs14
basic_scaling:
  max_instances: 1
```

Why should you bother about scaling type? It's because that Free Tier provides different quotes for different scalling types (See all details here - https://cloud.google.com/free/docs/gcp-free-tier#free-tier-usage-limits):
* 28 hours per day of "F" instances
* 9 hours per day of "B" instances

"F" instances means automatic scaling.
"B" instances means basic (or manual) scaling.

So using one instance in standard environment with basic scaling you have 9 hours of execution to use free of change. After that you'll be billing - check [pricing](https://cloud.google.com/appengine/pricing) (at 2021 it's $0.05 per hour).

You always can change environemnt, scaling and instance class in your app.yaml, see detail here -
https://cloud.google.com/appengine/docs/standard/nodejs/config/appref.


## Configuration
The only configuration the application supports is via environment variables (those can be specified only via `app.yaml`). If you need to change an environment variable you need to redeploy app.

Here's a list of supported environment variables:
* `MASTER_SPREADSHEET` - identifier of master Google spreadsheet (generated by `setup.sh`)
* `SECURITY` - security mode, for App Engine it's recommended 'IAP'
* `EXPECTED_AUDIENCE` - expected audience for IAP to verify (generated by `setup.sh`)
* `MAILER_CONFIG_PATH` - a path to json file with Nodemailer configuration - see [Email notifications](#email-notifications)
* `LOG_LEVEL` - minimum log level (usually 'info' or 'debug'), for production it's 'info' by default
* `GAE_LOCATION`- optional, cloud location for Cloud Scheduler, by default it'll be the same as AppEngine location (either 'us-west1' and 'europe-west1')
* `GIT_COMMIT` - a git hash commit from which the version was built, generated by `update.sh`
* `HEALTH_CHECK_URL` - a health check endpoint for AppEngine, be default `/_ah/health`

Please note that an empty value for a variable in app.yaml becomes 'None' in runtime. So it's better to avoid adding empty variables.


## Change history

See [CHANGELOG](CHANGELOG.md)


## License

Apache Version 2.0

See [LICENSE](LICENSE)