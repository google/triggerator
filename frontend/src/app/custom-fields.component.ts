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
import { Component, Input, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { Config, SdfElementType, SDF, CustomFields } from '../../../backend/src/types/config';
import { AppEditorComponent } from './app-editor.component';
import { ComponentBase } from './component-base';
import { ConfigService } from './shared/config.service';

@Component({
  selector: 'app-custom-fields',
  templateUrl: './custom-fields.component.html',
  styleUrls: ['./custom-fields.component.css']
})
export class CustomFieldsComponent extends ComponentBase implements OnInit {
  displayedColumns: string[] = ['rule_name', 'media', 'sdf_type', 'sdf_field', 'value', 'action'];
  dataSource = new MatTableDataSource<any>();
  form: FormGroup;
  rows: FormArray;
  ruleNames: string[];
  mediaTypes = ['', 'Display', 'YouTube']
  // TODO: remove filter after supporting Campaign-level custom fields
  sdfTypes = Object.keys(SdfElementType).filter(v => v !== SdfElementType.Campaign);
  sdfFields: Record<number, string[]> = {};

  constructor(
    dialog: MatDialog,
    snackBar: MatSnackBar,
    private fb: FormBuilder,
    private configService: ConfigService) {
    super(dialog, snackBar);
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      rows: this.fb.array([])
    });
  }
  @Input() appId: string;

  _config: Config;
  @Input() set data(config: Config) {
    this._config = config;
    if (config) {
      config.customFields = config.customFields || [];
      this.rows = this.fb.array(config.customFields.map(val => this.fb.group({
        //position: new FormControl(val.position),
        rule_name: new FormControl(val.rule_name),
        media: new FormControl(val.media),
        sdf_type: new FormControl(val.sdf_type),
        sdf_field: new FormControl(val.sdf_field),
        value: new FormControl(val.value),
        action: null,
        isEditing: new FormControl(false),
        isNew: new FormControl(false)
      })
      )); //end of fb array
      this.form = this.fb.group({
        rows: this.rows
      }); // end of form group cretation
      this.dataSource.data = this.rows.controls;
      this.ruleNames = ['All'].concat(config.rules.map(r => r.name));
    }
  }
  @Input() parent: AppEditorComponent;

  getFeedDataColumns(): string[] {
    return this.parent.getFeedDataColumns();
  }

  addNewRow() {
    const control = this.form.get('rows') as FormArray;
    control.push(this.fb.group({
      //position: new FormControl(val.position),
      rule_name: new FormControl(''),
      media: new FormControl(''),
      sdf_type: new FormControl(''),
      sdf_field: new FormControl(''),
      value: new FormControl(''),
      action: null,
      isEditing: new FormControl(true),
      isNew: new FormControl(true)
    }));
    this.dataSource.data = control.controls;
    this.sdfFields[control.length - 1] = [];
  }

  onSdfTypeChange(index: number, formGroup: FormGroup) {
    const field = formGroup.get('sdf_field');
    field.setValue(null);
    field.markAsUntouched();

    let sdf_type = formGroup.get('sdf_type').value;
    this.updateSdfFieldSelectValues(index, sdf_type);
  }

  private updateSdfFieldSelectValues(index: number, sdf_type: any) {
    let sdf_fields = SDF[sdf_type];
    if (sdf_fields) {
      this.sdfFields[index] = Object.values(sdf_fields);
    } else {
      this.sdfFields[index] = [];
    }
  }

  /**
   * Enables the selected row for editing.
   * @param i
   */
  editRow(i) {
    let row = this.rows.at(i);
    let sdf_type = row.get('sdf_type').value;
    this.updateSdfFieldSelectValues(i, sdf_type);
    row.get('isEditing').patchValue(true);
  }

  /**
   * On click of correct button in table (after click on edit) this method will call
   * @param i
   */
  saveRow(i) {
    let elementGroup = this.rows.at(i);
    elementGroup.get('isEditing').patchValue(false);
    let isNew = !!elementGroup.get('isNew').value;
    let fields: CustomFields;
    if (isNew) {
      // create
      elementGroup.get('isNew').patchValue(false);
      fields = {
        rule_name: '', media: '', sdf_type: undefined, sdf_field: '', value: ''
      };
      this._config.customFields.push(fields);
    }
    else {
      // update
      fields = this._config.customFields[i];
    }
    fields.rule_name = elementGroup.get('rule_name').value;
    fields.media = elementGroup.get('media').value;
    fields.sdf_type = elementGroup.get('sdf_type').value;
    fields.sdf_field = elementGroup.get('sdf_field').value;
    fields.value = elementGroup.get('value').value;
    this.save();
  }

  /**
   * On click of cancel button in the table (after click on edit) this method will call and reset the previous data
   * @param i
   */
  cancelRow(i) {
    let elementGroup = this.rows.at(i);
    let isNew = !!elementGroup.get('isNew').value;
    if (isNew) {
      // new unsaved row, just remove it
      this.rows.removeAt(i);
      this.dataSource.data = this.rows.controls;
    }
    else {
      // restore data
      let fields = this._config.customFields[i];
      elementGroup.patchValue({
        rule_name: fields.rule_name,
        media: fields.media,
        sdf_type: fields.sdf_type,
        sdf_field: fields.sdf_field,
        value: fields.value,
        isEditing: false,
      });
    }
  }

  deleteRow(i) {
    this.rows.removeAt(i);
    this._config.customFields.splice(i, 1);
    this.dataSource.data = this.rows.controls;
    delete this.sdfFields[i];
    this.save();
  }

  async save() {
    try {
      await this.configService.saveConfig(this.appId, { customFields: this._config.customFields }, null);
    } catch (e) {
      this.handleApiError('Rules failed to save', e);
      return;
    }
  }
}
