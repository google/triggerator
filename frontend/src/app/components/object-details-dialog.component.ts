import { Component, Inject, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';

export interface ObjectDetailsDialogData {
  row: any;
  index: number;
  dataSource: MatTableDataSource<any>;
}
@Component({
  templateUrl: './object-details-dialog.component.html',
  styleUrls: ['./object-details-dialog.component.css']
})
export class ObjectDetailsDialogComponent implements OnInit {
  fields: string[];
  currentIndex: number;

  constructor(@Inject(MAT_DIALOG_DATA) public data: ObjectDetailsDialogData) {
    this.fields = Object.keys(data.row);
    this.currentIndex = this.data.dataSource.data.indexOf(this.data.row);
  }

  ngOnInit(): void {
  }

  goPrev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
    } else {
      this.currentIndex = this.data.dataSource.data.length - 1;
    }
    this.data.row = this.data.dataSource.data[this.currentIndex];
  }
  goNext() {
    if (this.currentIndex < this.data.dataSource.data.length - 1) {
      this.currentIndex++;
    } else {
      this.currentIndex = 0;
    }
    this.data.row = this.data.dataSource.data[this.currentIndex];
  }
}
