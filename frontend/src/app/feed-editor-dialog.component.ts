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
import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FeedInfo, FeedType } from '../../../backend/src/types/config';

@Component({
  templateUrl: './feed-editor-dialog.component.html',
  styleUrls: ['./feed-editor-dialog.component.css']
})
export class FeedEditorDialogComponent implements OnInit {
  feedTypes = [
    { value: FeedType.Auto, title: 'Auto-detect'},
    { value: FeedType.JSON, title: 'JSON'},
    { value: FeedType.JSONL, title: 'JSONL (JSON New Lines)'},
    { value: FeedType.CSV, title: 'CSV (comma-separated values)'},
    { value: FeedType.GoogleSpreadsheet, title: FeedType.GoogleSpreadsheet},
    { value: FeedType.GoogleCloudBigQuery, title: FeedType.GoogleCloudBigQuery}
  ];
  form: FormGroup;

  constructor(
    private dialogRef: MatDialogRef<FeedEditorDialogComponent>,
    private fb: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public feed: FeedInfo) {
    this.form = this.fb.group({
      name: [feed?.name, [Validators.required]],
      type: [feed?.type, [Validators.required]],
      url: [feed?.url, [Validators.required]],
      charset: feed?.charset,
      key_column: feed?.key_column,
      external_key: feed?.external_key
    });
  }

  ngOnInit(): void {
  }

  save() {
    // TODO: validation: name, type, url
    this.dialogRef.close(this.form.value);
  }
}
