import { Component, Input, OnInit, ViewChild, TemplateRef, ViewContainerRef, DoCheck, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";

export enum ConfirmationDialogModes {
  YesNo = "YesNo",
  Ok = "Ok"
}
export interface ConfirmationDialogData {
  message: string;
  mode: ConfirmationDialogModes;
}
@Component({
  template: `
<h1 mat-dialog-title>
  <span *ngIf="data.mode === 'YesNo'">Confirm action</span>
  <span *ngIf="data.mode === 'Ok'">Warning</span>
</h1>
<div mat-dialog-content>{{ data.message }}</div>
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
  constructor(@Inject(MAT_DIALOG_DATA) public data: ConfirmationDialogData) {}
}