/**
 * Copyright 2021 Google LLC
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
import { Overlay } from '@angular/cdk/overlay';
import { Component, Input, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { Config, RuleInfo } from '../../../backend/src/types/config';
import { ComponentBase } from './component-base';
import { ConfirmationDialogComponent, ConfirmationDialogModes } from './components/confirmation-dialog.component';
import { RuleEditorDialogComponent } from './rule-editor-dialog.component';
import { ConfigService } from './shared/config.service';

@Component({
  selector: 'tr-rules-list',
  templateUrl: './rules-list.component.html',
  styleUrls: ['./rules-list.component.scss']
})
export class RulesListComponent implements OnInit {
  dataSource: MatTableDataSource<RuleInfo>;
  columnsToDisplay = ['name', 'condition', 'actions'];

  constructor(private dialog: MatDialog,
    private configService: ConfigService,
    private overlay: Overlay) {
    this.dataSource = new MatTableDataSource<RuleInfo>();
  }
  @Input() appId: string;

  _data: Config;
  @Input() set data(config: Config) {
    this._data = config;
    if (config) {
      config.rules = config.rules || [];
      this.dataSource.data = config.rules;
    }
  }
  @Input() parent: ComponentBase;

  ngOnInit(): void {
  }


  createRule() {
    const dialogRef = this.dialog.open(RuleEditorDialogComponent, {
      width: '600px',
      data: {
        configId: this.appId,
        config: this._data
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.dataSource.data = this._data.rules;
      }
    });
  }

  editRule(rule: RuleInfo) {
    const dialogRef = this.dialog.open(RuleEditorDialogComponent, {
      width: '600px',
      data: {
        configId: this.appId,
        config: this._data,
        rule: rule
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log(result);
        this.dataSource.data = this._data.rules;
      }
    });
  }

  deleteRule(rule: RuleInfo) {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        message: `Are you sure to delete the rule "${rule.name}"?`,
        mode: ConfirmationDialogModes.YesNo
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log(result);
        let idx2del = this._data.rules.indexOf(rule);
        let rules = this._data.rules.slice();
        rules.splice(idx2del, 1);
        try {
          this.configService.saveConfig(this.appId, { rules: rules }, null);
        } catch(e) {
          this.parent.handleApiError('Deletion failed', e);
          return;
        }
        // if server save successful then update load data
        this._data.rules.splice(idx2del, 1);
        this.dataSource.data = this._data.rules;
      }
    });
  }
}
