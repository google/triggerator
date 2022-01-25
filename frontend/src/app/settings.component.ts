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
import { Component, OnInit, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute } from '@angular/router';
import * as _ from 'lodash';
import { ComponentBase } from './component-base';
import { ConfigService } from './shared/config.service';


@Component({
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent extends ComponentBase implements OnInit {
  loading: boolean;
  displayedColumns: string[] = ['name', 'value'];
  dataSource: MatTableDataSource<{ name: string; value: any }>;

  errorMessage: string;

  constructor(private configService: ConfigService,
    dialog: MatDialog, snackBar: MatSnackBar) {
    super(dialog, snackBar);
  }

  async ngOnInit() {
    this.loading = true;
    this.dataSource = new MatTableDataSource<{ name: string; value: any }>();
    try {
      const settings = (await this.configService.getSettings()).settings;
      const data = [];
      for (const name of Object.keys(settings)) {
        const value = settings[name];
        let val = <any>value;
        if (((<any>value).value && (<any>value).link)) {
          data.push({ name: name, value: val.value, link: val.link });
        }
        else if (_.isObject(value)) {
          for (const subname of Object.keys(value)) {
            if (_.isObject(value[subname])) {
              let val = <any>value[subname];
              data.push({ name: name + '.' + subname, value: val.value, link: val.link });
            } else {
              data.push({ name: name + '.' + subname, value: value[subname] });
            }
          }
        }
        else {
          data.push({ name, value });
        }
      }
      this.dataSource.data = data;
    } catch (e) {
      this.handleApiError('Failed to fetch settings', e);
    } finally {
      this.loading = false;
    }
  }

  async shareSpreadsheets() {
    this.errorMessage = null;
    this.loading = true;
    try {
      await this.configService.shareSpreadsheets();
    } catch (e) {
      this.handleApiError('An error occured during sharing', e);
      return;
    } finally {
      this.loading = false;
    }
  }
}
