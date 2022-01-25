#!/bin/bash
#
# Copyright 2022 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
COLOR='\033[0;36m' # Cyan
NC='\033[0m' # No Color

# NOTE: despite other GCP services GAE supports only two regions: europe-west and us-central
GAE_LOCATION=europe-west
PROJECT_TITLE=Triggerator
USER_EMAIL=$(gcloud config get-value account 2> /dev/null)
# detect default service account
PROJECT_ID=$(gcloud config get-value project 2> /dev/null) #"$(gcloud app describe --format='value(id)')"
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID | grep projectNumber | sed "s/.* '//;s/'//g")
SERVICE_ACCOUNT=$PROJECT_ID@appspot.gserviceaccount.com
MASTER_SPREADSHEET=

enable_apis() {
  echo -e "${COLOR}Enabling APIs:${NC}"
  # Google Sheets
  echo -e "${COLOR}\tGoogle Sheets API...${NC}"
  gcloud services enable sheets.googleapis.com
  # Google Drive
  echo -e "${COLOR}\tGoogle Drive API...${NC}"
  gcloud services enable drive.googleapis.com
  # Cloud Build API
  echo -e "${COLOR}\tCloud Build API...${NC}"
  gcloud services enable cloudbuild.googleapis.com
  # Cloud Resource Manager API (it's needed for `gcloud alpha iap web add-iam-policy-binding`)
  echo -e "${COLOR}\tCloud Resource Manager API...${NC}"
  gcloud services enable cloudresourcemanager.googleapis.com
  # Cloud Scheduler
  echo -e "${COLOR}\tGoogle Scheduler API...${NC}"
  gcloud services enable cloudscheduler.googleapis.com
  # Identity-Aware Proxy
  echo -e "${COLOR}\tIAP...${NC}"
  gcloud services enable iap.googleapis.com
  # DV360
  echo -e "${COLOR}\tGoogle DV360 API...${NC}"
  gcloud services enable displayvideo.googleapis.com
  # create GAE
  echo -e "${COLOR}Creating App Engine application...${NC}"
  gcloud app create --region $GAE_LOCATION
  # App Engine Admin API
  echo -e "${COLOR}\tApp Engine Admin API...${NC}"
  gcloud services enable appengine.googleapis.com
}

urlencode() {
  python3 -c 'from urllib.parse import quote; import sys; print(quote(sys.argv[1], sys.argv[2]))' \
    "$1" "$urlencode_safe"
}

# apply overwrites from command line arguments
while :; do
    case $1 in
  -m|--masterdoc)
      shift
      MASTER_SPREADSHEET=$1
      ;;
  -t|--title)
      shift
      PROJECT_TITLE=$1
      ;;
  -u|--user)
      shift
      USER_EMAIL=$1
      ;;
  -l|--location)
      shift
      GAE_LOCATION=$1
      ;;
  *)
      break
    esac
  shift
done

LOCATION=${GAE_LOCATION}1

# enable required APIs
enable_apis

spreadsheetId=$MASTER_SPREADSHEET
if [ -z "$spreadsheetId" ]; then
  # master spreadsheet wasn't specified via cli arguments
  # create a master spreadsheet and share it with the  SA
  # NOTE: to access Sheets and Drive APIs we can't use gcloud's access token,
  # so we'll use GAE's default service account.
  # For this we'll export its key and set it up in well-known envvar GOOGLE_APPLICATION_CREDENTIALS,
  # where Python client (used in create-spreadsheet.py) can find it.
  gcloud iam service-accounts keys create key.json --iam-account=$SERVICE_ACCOUNT
  export GOOGLE_APPLICATION_CREDENTIALS=$(pwd)/key.json
  spreadsheetId=$(python3 ./create-spreadsheet.py  --user $USER_EMAIL)
fi

if [ -z "$spreadsheetId" ]; then
  echo "Spreadsheet was not created, unable to proceed"
  exit
fi
echo -e "${COLOR}Created a master spreadsheet: $spreadsheetId${NC}"

cd ../backend

# generate app.yaml:
cp app.yaml.copy app.yaml

# put spreadsheet id into app.yaml
echo -e "${COLOR}Updating app.yaml...${NC}"
# NOTE: the "'.original' -e" syntax is for MacOS compatibility
sed -i'.original' -e "s/MASTER_SPREADSHEET\s*:\s*.*$/MASTER_SPREADSHEET: '$spreadsheetId'/" app.yaml
# put SECURITY: 'IAP'
sed -i'.original' -e "s/SECURITY\s*:\s*.*$/SECURITY: 'IAP'/" app.yaml
# put EXPECTED_AUDIENCE: '/projects/685425631282/apps/triggerator-sd'
sed -i'.original' -e "s/EXPECTED_AUDIENCE\s*:\s*.*$/EXPECTED_AUDIENCE: '\/projects\/$PROJECT_NUMBER\/apps\/$PROJECT_ID'/" app.yaml
# put GIT_COMMIT:  59eef42ccb3bca1d6c1a9c3b00cf03b1277c70e1
GIT_COMMIT=$(git rev-parse HEAD)
sed -i'.original' -e "s/GIT_COMMIT\s*:\s*.*$/GIT_COMMIT: '$GIT_COMMIT'/" app.yaml

# app.yaml is done, save it to a well-known location on GCS, so that it's not lost
GCS_BUCKET=gs://${PROJECT_ID}-setup
gsutil mb -l $LOCATION -b on $GCS_BUCKET
gsutil cp app.yaml $GCS_BUCKET/


# build and deploy app to GAE:
echo -e "${COLOR}Building app...${NC}"
cd ../scripts
./build.sh
echo -e "${COLOR}Deploying app to GAE...${NC}"
cd ../backend
gcloud app deploy --quiet


# create IAP
echo -e "${COLOR}Creating oauth brand (consent screen) for IAP...${NC}"
gcloud alpha iap oauth-brands create --application_title="$PROJECT_TITLE" --support_email=$USER_EMAIL
# Output `gcloud alpha iap oauth-brands create` example:
# Created [964442731935].
# applicationTitle: Triggerator
# name: projects/964442731935/brands/964442731935

# create OAuth client for IAP
echo -e "${COLOR}Creating OAuth client for IAP...${NC}"
# TODO: ideally we need to parse the response from the previous command to get brand full name
gcloud alpha iap oauth-clients create projects/$PROJECT_NUMBER/brands/$PROJECT_NUMBER --display_name=iap \
  --format=json 2> /dev/null |\
  python3 -c "import sys, json; res=json.load(sys.stdin); i = res['name'].rfind('/'); print(res['name'][i+1:]); print(res['secret'])" \
  > .oauth
# NOTE: readarray isn't supported on MacOS
# readarray -t lines < .oauth
lines=()
$ while IFS= read -r line; do lines+=("$line"); done < .oauth

# Now in .oauth file we have two line, first client id, second is client secret
IAP_CLIENT_ID=${lines[0]}
IAP_CLIENT_SECRET=${lines[1]}
# Output `gcloud alpha iap oauth-clients create` example:
# {
#  "displayName": "iap",
#  "name": "projects/964442731935/brands/964442731935/identityAwareProxyClients/964442731935-tdkmgnvv296bcsr2ic04rl31o2ih0drv.apps.googleusercontent.com",
#  "secret": "gI4O6va8vVj8eYSduWgIUAN5"
# }

TOKEN=$(gcloud auth print-access-token)

# Enable IAP for AppEngine
# (source:
#   https://cloud.google.com/iap/docs/managing-access#managing_access_with_the_api
#   https://cloud.google.com/iap/docs/reference/app-engine-apis)
echo -e "${COLOR}Enabling IAP for App Engine...${NC}"
curl -X PATCH -H "Content-Type: application/json" \
 -H "Authorization: Bearer $TOKEN" \
 --data "{\"iap\": {\"enabled\": true, \"oauth2ClientId\": \"$IAP_CLIENT_ID\", \"oauth2ClientSecret\": \"$IAP_CLIENT_SECRET\"} }" \
 "https://appengine.googleapis.com/v1/apps/$PROJECT_ID?alt=json&update_mask=iap"

# Grant access to the current user
echo -e "${COLOR}Granting user $USER_EMAIL access to the app through IAP...${NC}"
gcloud alpha iap web add-iam-policy-binding --resource-type=app-engine --member="user:$USER_EMAIL" --role='roles/iap.httpsResourceAccessor'

echo -e "\n${COLOR}Done!${NC}"
echo -e "Add service account ${COLOR}$SERVICE_ACCOUNT ${NC} as a user to your DV360 account"
echo -e "You are ready to use the application - just type ${COLOR}gcloud app browse${NC} to see its url"

gcloud app browse
