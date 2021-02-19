import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface EditValueDialogData {
  label: string;
  value: any;
}

@Component({
  template: `
<h1 mat-dialog-title>Edit</h1>
<div mat-dialog-content>
  <mat-form-field appearance="outline" class="full-width" color="accent">
    <mat-label>{{ data.label }}</mat-label>
    <input matInput [(ngModel)]="value">
  </mat-form-field>
</div>
<div mat-dialog-actions class="mt-15" style="text-align: center;">
  <div class="full-width">
    <button mat-raised-button color="primary" [mat-dialog-close]="value" cdkFocusInitial>Ok</button>
    <button mat-raised-button mat-dialog-close>Cancel</button>
  </div>
</div>
  `
})
export class EditValueDialogComponent {
  value: string
  constructor(@Inject(MAT_DIALOG_DATA) public data: EditValueDialogData) { 
    this.value = data.value;
  }
}