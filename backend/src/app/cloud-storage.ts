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
import { DownloadResponse, Storage } from '@google-cloud/storage';

/**
 * Copies a local file to Google Cloud Storage bucket.
 * @param filePath Local file path
 * @param destStorageUrl Destination path on GCS in format gs://bucket_name/folderpath
 */
 export async function uploadFileToGCS(filePath: string, destStorageUrl: string) {
  const storage = new Storage();
  let parsed = new URL(destStorageUrl);
  let bucket = parsed.hostname;
  let filename = parsed.pathname.substring(1);
  await storage.bucket(bucket).upload(filePath, {
    destination: filename,
  });
}

export async function downloadFileFromGCS(filePath: string, destFolder?: string): Promise<string> {
  const storage = new Storage();
  let parsed = new URL(filePath);
  let bucket = parsed.hostname;
  let filename = parsed.pathname.substring(1);
  let response: DownloadResponse = await storage.bucket(bucket).file(filename).download({destination: destFolder});
  let fileContent = Buffer.from('');
  for (const chunk of response) {
    fileContent = Buffer.concat([fileContent, chunk]);
  }
  return fileContent.toString('utf8');
}