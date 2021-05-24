# Changelog

>NOTE: BE is backend (server application), FE - frontend (client applciation)

## 2021-05-24 (1.2.0)
* Logging with winston and cloud-logging
* Rewrite of 'Run Execution' due to the lack of support of Server-Sent Events (and any streaming) in Google AppEngine Std 
* BE: loadApplicationLists: returning job info; FE: application list displays scheduled statuses for each application
* setup: `update.sh` extracts and puts git commit hash into `app.yaml`, that git hash will be visible on Settings page in the UI

## 2021-04-30
* setup: `setup.sh` backs up generated `app.yaml` file on GCS and `update.sh` fetches it from there if it doesn't exist locally
* setup: setup.sh refactoring: added cli args to overwrite GAE location, title, user email
* deployment: use basic scaling by default in `app.yaml.copy`
* README: updating, scaling

## 2021-04-29
* Fix: DV360Facade: fixed asynchronous errors and api wrapper creation ("Error: Login Required.")
* SdfGenerator:
  - copy start/end dates from existing campaign on updating;
  - do not overwrite start date for existing campaign if it's in the past
* Fix: SdfService: fixed parsing of dates

## 2021-04-28
* BE: SdfGenerator: check geo_code for being an integer before assigning into LI

## 2021-04-27 (1.1.0)
* BE: added sending email notifications via Nodemailer (tested via Mailgun)
* FE: added support of nested objects in displaying feed results and showing details in dialog window for result rows (with navigation though them in the dialog)
* BE: SdfGenerator: check geo_code for being an integer before assigning into LI
* setup: added update.sh
* setup: setup.sh: added missing enablement of Cloud Scheduler API
* Fix: BE: fixed error during scheduler job creation ("Missing required parameters: parent")
* BE: added validation of columns during SDF generation (that columns from config do exist in feed data) (it prevents generating invalid SDFs)

## 2021-04-20 (1.0.0)
First public release
