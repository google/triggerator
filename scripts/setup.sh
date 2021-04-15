# 
# Copyright 2021 Google LLC
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

ask() {
  if [ -z "$2" ]; then
    echo "$3"
    read $1
  fi
}

enable_apis() {
  echo -e "${COLOR}enabling APIs...${NC}"
  # Google Sheets
  echo -e "${COLOR}Google Sheets API...${NC}"
  gcloud services enable sheets.googleapis.com
  # Google Drive
  echo -e "${COLOR}Google Drive API...${NC}"
  gcloud services enable drive.googleapis.com
  # Identity-Aware Proxy
  gcloud services enable iap.googleapis.com
  # DV360
  echo -e "${COLOR}Google DV360 API...${NC}"
  gcloud services enable displayvideo.googleapis.com
  # create GAE
  echo -e "${COLOR}creating App Engine application...${NC}"
  gcloud app create --region europe-west
}

urlencode() {
  python3 -c 'from urllib.parse import quote; import sys; print(quote(sys.argv[1], sys.argv[2]))' \
    "$1" "$urlencode_safe"
}

create_spreadsheet() {
  local userEmail
  userEmail=$1
  echo -e "${COLOR}Creating a master spreadsheet${NC}"
  # hardcoded client id and secret of a GCP project to use during 
  client_id='563173416479-1kdbiqghrujkjmuevpv2orqt539ocej3.apps.googleusercontent.com'
  client_secret='9vuHv3JKIki47a34z-18Dx9d'
  scope=$(urlencode "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file")
  url="https://accounts.google.com/o/oauth2/auth?client_id=$client_id&redirect_uri=urn:ietf:wg:oauth:2.0:oob&scope=$scope&response_type=code"
  python3 -mwebbrowser $url
  echo -e "${COLOR}🔑 Authorize the script by visiting this url:\n${NC}$url \n ${COLOR}authorize and copy an authorization code back here\n${NC}"
  read -p "Enter the authorization code: " code
  token=$(curl --silent -X POST --data "code=$code&client_id=$client_id&client_secret=$client_secret&redirect_uri=urn:ietf:wg:oauth:2.0:oob&grant_type=authorization_code" https://accounts.google.com/o/oauth2/token | \
    python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")
  #echo "Aquired auth token '$token'"
  echo $token > .token

  spreadsheetId=$(curl --silent -X POST \
    --header "Content-Type: application/json" \
    --header "Authorization: Bearer $token" \
    --data '{"sheets":[{"properties":{"title":"Main"}}],"properties":{"title":"Master doc"}}' \
    https://sheets.googleapis.com/v4/spreadsheets?alt=json | python3 -c "import sys, json; print(json.load(sys.stdin)['spreadsheetId'])")

  echo -e "${COLOR}Created a spreadsheet '$spreadsheetId'${NC}"
  echo -e "${COLOR}Adding permissions for $userEmail ${NC}"
  curl -X POST \
    --header "Content-Type: application/json" \
    --header "Authorization: Bearer $token" \
    --data "{\"role\": \"writer\", \"type\": \"user\", \"emailAddress\": \"$userEmail\"}" \
    https://www.googleapis.com/drive/v3/files/$spreadsheetId/permissions?alt=json

  echo -e "${COLOR}Added write permissions for $userEmail ${NC}"
}

# enable required APIs
enable_apis

while :; do
    case $1 in
  -t|--title)
      shift
      PROJECT_TITLE=$1
      ;;
  -u|--user)
      shift
      USER_EMAIL=$1
      ;;
  *)
      break
    esac
  shift
done
# create IAP
ask PROJECT_TITLE "$PROJECT_TITLE" "Project title:"
ask USER_EMAIL "$USER_EMAIL" "Project owner's Google account (email):"
gcloud alpha iap oauth-brands create --application_title="$PROJECT_TITLE" --support_email=$USER_EMAIL

#TODO: gcloud alpha iap oauth-clients create projects/757798051795/brands/757798051795 --display_name=iap
###
# Created [355230337267-emurk31j1jueg7fvnnj5upck2ud9eejh.apps.googleusercontent.com].
# displayName: iap
# name: projects/355230337267/brands/355230337267/identityAwareProxyClients/355230337267-emurk31j1jueg7fvnnj5upck2ud9eejh.apps.googleusercontent.com
# secret: P03zv2X_ePy6B9vk8RdGv3Qx
###

cd ../backend

# generate app.yaml:
cp app.yaml.copy app.yaml

# detect default service account 
PROJECT_ID=$(gcloud config get-value project) #"$(gcloud app describe --format='value(id)')"
#PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID | grep projectNumber | sed "s/.* '//;s/'//g")
SERVICE_ACCOUNT=$PROJECT_ID@appspot.gserviceaccount.com

# create a master spreadsheet, share the doc with SA
create_spreadsheet "$SERVICE_ACCOUNT"

if [ -z "$spreadsheetId" ]; then
  echo "unable to proceed"
  exit
fi

# put its id into app.yaml
echo -e "${COLOR}updating app.yaml...${NC}"
sed -i "s/MASTER_SPREADSHEET\s*:\s*.*$/MASTER_SPREADSHEET: '$spreadsheetId'/" app.yaml


# fill EXPECTED_AUDIENCE var in app.yaml

# build and deploy app to GAE:
cd ../scripts
./build-n-deploy.sh

echo -e "${COLOR}Please go to IAP page\n${NC}https://pantheon.corp.google.com/security/iap\n"
echo -e "${COLOR}and enable IAP for App Engine app"
echo -e "${COLOR}Then click on App Engine resource and append yourself as a user with 'IAP-secured Web App User' role"
# [Manual] go to https://console.cloud.google.com/security/iap and enable IAP for AppEngine app
# copy "Get GWT audience"
# e.g. /projects/757798051795/apps/triggerator-test
# Add youself and any other users with 'IAP-secured Web App User' role to access the app

# [Manual] dd your SA to your DV360 account 