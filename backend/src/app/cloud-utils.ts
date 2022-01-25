/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { google } from 'googleapis';

/**
 * Returns current GCP project id,
 * overcome issue https://github.com/googleapis/google-auth-library-nodejs/issues/1211
 * (when google.auth.getProjectId return project id from global config instead of from specified keyFile).
 * @returns project id
 */
export async function getProjectId() {
  let projectId: string;
  if (google._options?.auth) {
    projectId = await (<any>google._options.auth).getProjectId();
  }
  else {
    projectId = await google.auth.getProjectId();
  }
  return projectId;
}