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
import { Component, Input, OnInit, ViewChild, TemplateRef, ViewContainerRef, DoCheck, Inject, SecurityContext } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export enum ConfirmationDialogModes {
  YesNo = 'YesNo',
  Ok = 'Ok'
}
export interface ConfirmationDialogData {
  message?: string;
  html?: string;
  mode: ConfirmationDialogModes;
  header?: string;
}
@Component({
  template: `
<h1 mat-dialog-title>
  <span *ngIf="data.mode === 'YesNo'">Confirm action</span>
  <span *ngIf="data.mode === 'Ok'">{{ data.header || 'Warning' }}</span>
</h1>
<div mat-dialog-content [innerHtml]="html">{{ data.message }}</div>
<div mat-dialog-actions class="mt-15" style="text-align: center;">
  <div *ngIf="data.mode === 'YesNo'" class="full-width">
    <button mat-raised-button color="primary" [mat-dialog-close]="true" cdkFocusInitial>Yes</button>
    <button mat-raised-button mat-dialog-close>No</button>
  </div>
  <div *ngIf="data.mode === 'Ok'" class="full-width">
    <button color="primary" mat-raised-button mat-dialog-close>Ok</button>
  </div>
</div>
  `
})
export class ConfirmationDialogComponent {
  html: SafeHtml;
  constructor(@Inject(MAT_DIALOG_DATA) public data: ConfirmationDialogData, private sanitized: DomSanitizer) {
    if (data.html) {
      this.html = this.sanitized.bypassSecurityTrustHtml(data.html);
    } else {
      this.html = this.sanitized.sanitize(SecurityContext.HTML, data.message);
    }
  }
}
