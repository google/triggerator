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
import { google, drive_v3 } from 'googleapis';
import path from 'path';
import fs from 'fs';
import logger from './logger-winston';

export async function uploadFile(filePath: string, destinationUrl: string): Promise<string> {
  if (!destinationUrl || !destinationUrl.startsWith("drive://"))
    throw new Error(`[GoogleDriveFacade] destination (${destinationUrl}) is in incorrect format, expected 'drive://folderid'`);

  let folderId = destinationUrl.substring("drive://".length);
  const driveAPI = google.drive({ version: 'v3' });
  const res = await driveAPI.files.create(
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

  const driveAPI = google.drive({ version: 'v3' });
  let res: drive_v3.Schema$FileList;
  res = (await driveAPI.files.list({
    //mimeType='application/vnd.google-apps.folder'
    q: `'${folderId}' in parents and name = '${fileName}'`,
    fields: 'files(id, name)',
    spaces: 'drive'
  })).data;

  if (!res.files?.length) {
    throw new Error(`[GoogleDriveFacade] File ${fileName} wasn't found in Google Drive folder ${folderId} (or was't shared with the server's service account)`);
  }
  const fileId = res.files[0].id!;
  return new Promise(async (resolve, reject) => {
    let fileContents = Buffer.from('');
    (await driveAPI.files.get({
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

export async function importCsvAsSpreadsheet(filePath: string, title: string, ownerEmail?: string | undefined | null): Promise<string> {
  var media = {
    mimeType: 'text/csv',
    body: fs.createReadStream(filePath)
  };
  const driveAPI = google.drive({ version: 'v3' });
  let result = await driveAPI.files.create({
    requestBody: {
      'name': title,
      'mimeType': 'application/vnd.google-apps.spreadsheet'
    },
    media: media,
    fields: 'id'
  });
  let fileId = result.data.id!;
  if (ownerEmail) {
    try {
      await driveAPI.permissions.create({
        fileId: fileId,
        requestBody: {
          type: 'user',
          role: 'owner',
          emailAddress: ownerEmail,
        },
        transferOwnership: true,
        fields: 'id'
      });
    } catch (e) {
      logger.warn(`Failed to transfer ownership for documenet ${fileId}: ${e.message}`, e);
      // there could be a case when transfering ownership doesn't work -
      // "Sorry, cannot transfer ownership to xxx@xxx.com. Ownership can only be transferred to another user in the same organization as the current owner."
      // so in a case of error just share the doc with the user instead
      (await driveAPI.permissions.create({
        fileId: fileId,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: ownerEmail
        }
      }));
    }
  }
  return fileId;
}

export function shareFile(fileId: string, userEmail: string): Promise<any> {
  let driveAPI = google.drive({ version: "v3" });
  return driveAPI.permissions.create({
    fileId: fileId,
    requestBody: {
      role: 'writer',
      type: 'user',
      emailAddress: userEmail
    }
  });
}

export default {
  importCsvAsSpreadsheet,
  downloadFile,
  uploadFile,
  shareFile
};