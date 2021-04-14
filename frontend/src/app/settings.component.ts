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
  dataSource: MatTableDataSource<{name: string, value: any}>;

  errorMessage: string;

  constructor(private configService: ConfigService,
    dialog: MatDialog, snackBar: MatSnackBar) { 
    super(dialog, snackBar);
  }

  async ngOnInit() {
    this.loading = true;
    this.dataSource = new MatTableDataSource<{name: string, value: any}>();
    try {
      let settings = (await this.configService.getSettings()).settings;
      let data = [];
      for(let name of Object.keys(settings)) {
        let value = settings[name];
        if (_.isObject(value)) {
          for(let subname of Object.keys(value)) {
            data.push({name: name + '.' + subname, value: value[subname]});
          }
        } else {
          data.push({name, value: value});
        }
      }
      this.dataSource.data = data;
    } catch(e) {
      this.handleApiError('Failed to fetch settings', e);
    } finally {
      this.loading = false;
    }
  }

}
