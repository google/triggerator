# Changelog

>NOTE: BE is backend (server application), FE - frontend (client applciation)

## 2022-01-26
* Reflect status of mail setup status in UI
* Ability to send a test email from UI

## 2021-11-16 (1.8.0)
* UI for defining joins of feeds

## 2021-11-12 (1.7.0)
* Cloning applications
* Ability to share spreadsheets with current user from application ('Reshare' on Settings page)
* Prevent static files caching (ease updating app)
* Display configuration last update timestamps

## 2021-10-05 (1.6.0)
* Support for multiple YouTube-creatives (a YT rule can have a list of creatives not just one)

## 2021-09-24
* Fix: BigQuery feed urls open datasources in GCP BigQuery UI
* Fix: Support for Bid syntax "xN" for YouTube rules (previously only for Display rules)

## 2021-09-22
* Support for date and time in rules' expressions (mathjs was extended with new types and functions, see the User Guide)

## 2021-08-11 (1.5.0)
* Support for fetching data from Google Cloud BigQuery (tables/views/procedures)

## 2021-08-02 (1.4.0)
* UI for custom fields, support JS-expressions for custom field values

## 2021-06-28 (1.3.0)
* Reporting introduced: report "Activation times" (summary of time when LIs were activated for a period)
* Tracking of last run status in master spreadsheet, statuses are visible in application list

## 2021-06-12
* BE: set reasonable defaults for campaign name templates during new configuration creation
* BE: implemented validation for templates (correctness of rule_name/row_name macros usage)
* FE: app-editor: implemented 'Undo last change' editor-wide operation, added 'Generate default templates' operation

## 2021-06-04
* Support two new flags for manual execution: forceUpdate (issue DV360 API call to activate/deiactive even if an IO/LI alread activated/paused), dryRun (do not issue real DV360 API calls)

## 2021-06-02
* setup: `setup.sh` support `-m` argument with a master spreadsheet id to skip spreadsheet creation for environments where it's not possible/not needed (e.g. you can't export private key for your service account)

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
