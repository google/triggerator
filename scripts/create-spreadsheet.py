"""Create a new spreadsheet
 
Before running, execute the following commands to set up ADC:
 
```
# Install deps
python -m pip install --upgrade \
    google-api-python-client \
    google-auth-httplib2 \
    google-auth-oauthlib \
    google-auth

# Login and set project
gcloud init
 
# Enable Google Sheets API
gcloud services enable sheets.googleapis.com
 
# wait a few seconds for the setting to propagate
sleep 30
 
# Enable sheets scope with ADC
gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive
```
 
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
        "properties": {"title": "Master doc"}
    }).execute()
    spreadsheetId = result['spreadsheetId']

    driveAPI = build('drive', 'v3', credentials=creds)
    access = driveAPI.permissions().create(
        fileId=spreadsheetId,
        body={'type': 'user', 'role': 'writer',
              'emailAddress': emailAddress},
        fields='id'
    ).execute()

    print(spreadsheetId)


if __name__ == '__main__':
    main(args.userEmail)
