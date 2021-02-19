import { Component, Inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";

@Component({
  templateUrl: './generate-sdf-dialog.component.html',
  styleUrls: ['./generate-sdf-dialog.component.scss']
})
export class GenerateSdfDialogComponent {

  constructor(
    public dialogRef: MatDialogRef<GenerateSdfDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any) { }

  onCloseClick(): void {
    this.dialogRef.close();
  }
  generateSdf() {
    alert('generate');
  }
  updateSdf() {
    alert('update');
  }
}