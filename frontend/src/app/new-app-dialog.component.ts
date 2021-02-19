import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  templateUrl: './new-app-dialog.component.html',
  styleUrls: ['./new-app-dialog.component.css']
})
export class NewAppDialogComponent implements OnInit {
  form: FormGroup;
  constructor(private dialogRef: MatDialogRef<NewAppDialogComponent>,
    private fb: FormBuilder) { 
      this.form = this.fb.group({
        name: [null, [Validators.required]],
        appId: null
      });
    }

  ngOnInit(): void {
  }
  save() {
    // TODO: validation: name, type, url
    this.dialogRef.close(this.form.value);
  }
}
