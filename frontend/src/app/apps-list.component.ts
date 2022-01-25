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
import { AfterViewInit, Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { Router } from '@angular/router';
import { AppInfo, Config } from '../../../backend/src/types/config';
import { ComponentBase } from './component-base';
import { NewAppDialogComponent } from './new-app-dialog.component';
import { ConfigService } from './shared/config.service';

@Component({
  selector: 'app-apps-list',
  templateUrl: './apps-list.component.html',
  styleUrls: ['./apps-list.component.scss']
})
export class AppsListComponent extends ComponentBase implements OnInit {
  loading: boolean;
  displayedColumns: string[] = ['position', 'name', 'spreadsheetId', 'status', 'scheduled', 'lastModified', 'actions'];
  dataSource: MatTableDataSource<AppInfo>;

  mouseOverIndex;

  constructor(public router: Router,
    private configService: ConfigService,
    dialog: MatDialog,
    snackBar: MatSnackBar) {
    super(dialog, snackBar);
    this.dataSource = new MatTableDataSource<AppInfo>();
  }

  ngOnInit() {
    setTimeout(() => {
      this.load();
    }, 0);
  }

  private async load() {
    this.errorMessage = null;
    this.loading = true;
    //alert('loading');
    try {
      const apps = await this.configService.getAppList();
      const data = apps.configurations.slice();
      this.dataSource.data = data;
      this.updateRowNums();
    } catch (e) {
      this.handleApiError('Application list failed to load', e);
    } finally {
      this.loading = false;
    }
  }

  /** Recalculates row numbers */
  updateRowNums() {
    let i = 1;
    this.dataSource.data.forEach(el => el["position"] = i++);
  }

  onRefresh() {
    this.load();
  }

  onRowClick($event: MouseEvent, app: AppInfo) {
    if (!this.onTableRowClick($event)) { return; }
    if (app.status === 'invalid') { return; }
    this.router.navigate(['/apps', app.configId, 'edit']);
  }

  async deleteConfig(config: AppInfo) {
    this.errorMessage = null;
    const dialogRef = this.confirm(`Are you sure to delete the configuration "${config.name}"?`);
    const result = await dialogRef.afterClosed().toPromise();
    if (result) {
      try {
        await this.configService.deleteApp(config.configId);
      } catch (e) {
        this.handleApiError('An error occured during the application deletion', e);
        return;
      }
      this.dataSource.data.splice(this.dataSource.data.indexOf(config), 1);
      this.dataSource.data = this.dataSource.data;
      this.updateRowNums();
    }
  }

  async cloneConfig(config: AppInfo) {
    this.errorMessage = null;
    this.loading = true;
    try {
      const appInfo = await this.configService.cloneApp(config.configId);
      this.dataSource.data.push(appInfo);
      this.dataSource.data = this.dataSource.data;
      this.updateRowNums();
    } catch (e) {
      this.handleApiError('An error occured during application cloning', e);
      return;
    } finally {
      this.loading = false;
    }
  }

  async createConfig() {
    const result = await this.dialog.open(NewAppDialogComponent, {}).afterClosed().toPromise();
    if (result) {
      this.errorMessage = null;
      this.loading = true;
      try {
        const appInfo = await this.configService.createApp(result.name, result.appId);
        this.dataSource.data.push(appInfo);
        this.dataSource.data = this.dataSource.data;
        this.updateRowNums();
      } catch (e) {
        this.handleApiError('An error occured during application creation', e);
        return;
      } finally {
        this.loading = false;
      }
    }
  }
}
