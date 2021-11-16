import { Component, Inject, OnInit } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { FeedConfig, FeedInfo, FeedType } from '../../../backend/src/types/config';

interface FeedJoinWizardOptions {
  feedInfo: FeedConfig;
  columns: Record<string, string[]>;
}
@Component({
  selector: 'app-feed-join-wizard-dialog',
  templateUrl: './feed-join-wizard-dialog.component.html',
  styleUrls: ['./feed-join-wizard-dialog.component.scss']
})
export class FeedJoinWizardDialogComponent implements OnInit {
  form: FormGroup;
  //feedInfo: FeedConfig;

  constructor(
    private dialogRef: MatDialogRef<FeedJoinWizardDialogComponent>,
    private fb: FormBuilder,
    @Inject(MAT_DIALOG_DATA) public data: FeedJoinWizardOptions) {
    this.form = this.fb.group({
      feeds: fb.array(
        data.feedInfo.feeds.map(
          feed => fb.group({
            name: feed.name,
            columns: fb.array(data.columns[feed.name] || []),
            key_column: feed.key_column,
            external_key: feed.external_key
          })))
    });
  }

  get feeds(): FormArray {
    return <FormArray>this.form.get('feeds');
  }

  ngOnInit(): void {
  }

  save() {
    this.dialogRef.close(this.form.value);
  }

  linking = false;
  linkingFromFeed: AbstractControl;
  linkingFromColumn: string;

  startLinking(feedControl: AbstractControl, col: string) {
    this.linkingFromFeed = feedControl;
    this.linkingFromColumn = col;
    this.linking = true;
  }

  cancelLinking() {
    this.linkingFromFeed = undefined;
    this.linkingFromColumn = undefined;
    this.linking = false;
  }

  commitLinking(feedControlTo: AbstractControl, colTo: string) {
    this.linkingFromFeed.get("key_column").setValue(this.linkingFromColumn);
    this.linkingFromFeed.get("external_key").setValue(feedControlTo.get("name").value + "." + colTo);
    this.linkingFromFeed = undefined;
    this.linkingFromColumn = undefined;
    this.linking = false;
  }
  clearLink(feedControl: AbstractControl) {
    feedControl.get("key_column").setValue("");
    feedControl.get("external_key").setValue("");
  }

  isSameFeed(feedControl): boolean {
    if (!this.linking) return false;
    return this.linkingFromFeed === feedControl;
  }
}
