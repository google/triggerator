import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FeedInfo } from '../../../backend/src/types/config';

@Component({
  templateUrl: './feed-editor-dialog.component.html',
  styleUrls: ['./feed-editor-dialog.component.css']
})
export class FeedEditorDialogComponent implements OnInit {
  feedTypes = [
    { value: 'JSON', title: 'JSON'},
    { value: 'JSONL', title: 'JSONL (JSON New Lines)'},
    { value: 'CSV', title: 'CSV (comma-separated values)'},
    { value: 'Google Spreadsheet', title: 'Google Spreadsheet'}
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
