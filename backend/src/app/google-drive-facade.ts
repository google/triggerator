/**
 * Copyright 2021 Google LLC
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
import { google, drive_v3 } from 'googleapis';
import path from 'path';
import fs from 'fs';

export async function uploadFile(filePath: string, destinationUrl: string): Promise<string> {
  if (!destinationUrl || !destinationUrl.startsWith("drive://"))
    throw new Error(`[GoogleDriveFacade] destination is expected in 'drive://folderid' format`);
    
  let folderId = destinationUrl.substring("drive://".length);
  const drive = google.drive({ version: 'v3' });
  const res = await drive.files.create(
    {
      requestBody: {
        name: path.basename(filePath),
        parents: [folderId]
      },
      media: {
        body: fs.createReadStream(filePath),        
      },
      fields: 'id'
    }
  );
  let fileId = res.data.id;
  return fileId!;
}

export async function downloadFile(url: string): Promise<Buffer> {
  let matches = /drive\:\/\/([^/]+)\/(.+)/.exec(url);
  if (!matches || matches.length != 3) {
    throw new Error(`[GoogleDriveFacade] Couldn't parse url ${url}`);
  }
  let folderId = matches[1];
  let fileName = matches[2];

  const drive = google.drive({ version: 'v3' });
  let res: drive_v3.Schema$FileList;
  try {
    res = (await drive.files.list({
      //mimeType='application/vnd.google-apps.folder'
      q: `'${folderId}' in parents and name = '${fileName}'`,
      fields: 'files(id, name)',
      spaces: 'drive'
    })).data;
  } catch (e) {
    console.error(`[GoogleDriveFacade] Fetching Google Drive file ${url} failed: ${e.message}`);
    throw e;
  }
  if (!res.files?.length) {
    throw new Error(`[GoogleDriveFacade] File ${fileName} wasn't found in Google Drive folder ${folderId} (or was't shared with the server's service account)`);
  }
  const fileId = res.files[0].id!;
  return new Promise(async (resolve, reject) => {
    let fileContents = Buffer.from('');
    (await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, { responseType: "stream" }))
      .data.on('data', (chunk) => {
        fileContents = Buffer.concat([fileContents, chunk]);
      })
      .on('end', () => {
        resolve(fileContents);
      });
  });
}

export default {
  downloadFile,
  uploadFile
};