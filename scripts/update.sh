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

RED='\033[0;31m' # Red Color
NC='\033[0m' # No Color

echo -e "${RED}WARNING: all local changes will be overwritten${NC}"
read -p "Do you want to update repository and deployed app? (Y/N): " -n 1 -r
echo    # (optional) move to a new line
if [[ $REPLY =~ ^[Nn]$ ]]
then
    exit
fi

cd ..
git fetch
git reset --hard origin/main

PROJECT_ID=$(gcloud config get-value project 2> /dev/null)
FILE=./backend/app.yaml
if [ -f "$FILE" ]; then
  echo "Found app.yaml, ready to update"
else
  echo "No local app.yaml found, trying to copy it from GCS"
  GCS_BUCKET=gs://${PROJECT_ID}-setup
  gsutil cp $GCS_BUCKET/app.yaml $FILE
fi

if [ -f "$FILE" ]; then
  cd scripts
  ./build-n-deploy.sh
else
  echo "Couldn't find app.yaml (App Engine configuration file), unable to proceed"
fi

