"""
Copyright 2022 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""
"""Create a new spreadsheet

Before running, execute we need to setup default application credentials.
For example as environment valiable GOOGLE_APPLICATION_CREDENTIALS
"""

from argparse import ArgumentParser
import google.auth
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

parser = ArgumentParser()
parser.add_argument("-u", "--user", dest='userEmail', required=True, help="Google user account (email) to share a created doc with")
args = parser.parse_args()

def main(emailAddress):
    creds, project_id = google.auth.default(scopes=SCOPES)

    sheetsAPI = build('sheets', 'v4', credentials=creds)

    result = sheetsAPI.spreadsheets().create(body={
        "sheets": [{"properties": {"title": "Main"}}],
        "properties": {"title": "[Triggerator] Master doc for " + project_id}
    }).execute()
    spreadsheetId = result['spreadsheetId']

    driveAPI = build('drive', 'v3', credentials=creds)
    access = driveAPI.permissions().create(
        fileId=spreadsheetId,
        body={'type': 'user', 'role': 'writer',
              'emailAddress': emailAddress},
        fields='id',
        #transferOwnership=True  - use it if you want to transfer ownership (change role  to 'owner' then, and comment out sendNotificationEmail=False)
        sendNotificationEmail=False
    ).execute()

    print(spreadsheetId)


if __name__ == '__main__':
    main(args.userEmail)
