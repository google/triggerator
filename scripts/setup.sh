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

# enable required APIs
gcloud services enable sheets.googleapis.com

gcloud services enable displayvideo.googleapis.com

gcloud services enable drive.googleapis.com

gcloud services enable iap.googleapis.com

# create GAE
gcloud app create --region europe-west

# create IAP
gcloud alpha iap oauth-brands create --application_title=$project_title --support_email=$user_email

gcloud alpha iap oauth-clients create projects/757798051795/brands/757798051795 --display_name=iap
###
# Created [757798051795-7rmj117hbch0u6prjhc41h8jvd39b5jj.apps.googleusercontent.com].
# displayName: iap
# name: projects/757798051795/brands/757798051795/identityAwareProxyClients/757798051795-7rmj117hbch0u6prjhc41h8jvd39b5jj.apps.googleusercontent.com
# secret: utNegFtVw7n88dyknXCem6oP
###
