import { AfterViewInit, Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { Router } from '@angular/router';
import { AppInfo } from '../../../backend/src/types/config';
import { ComponentBase } from './component-base';
import { ConfirmationDialogComponent, ConfirmationDialogModes } from './components/confirmation-dialog.component';
import { NewAppDialogComponent } from './new-app-dialog.component';
import { ConfigService } from './shared/config.service';
/*
export interface IAppConfig {
  name: string;
  configId: string;
  version: string;
}
*/
@Component({
  selector: 'app-apps-list',
  templateUrl: './apps-list.component.html',
  styleUrls: ['./apps-list.component.scss']
})
export class AppsListComponent extends ComponentBase implements OnInit {
  loading: boolean;
  displayedColumns: string[] = ['position', 'name', 'spreadsheetId', 'version', 'status', 'actions'];
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
      let apps = await this.configService.getAppList();
      let data = apps.configurations.slice();
      this.dataSource.data = data;
      this.updateRowNums();
    } catch (e) {
      this.handleApiError("Application list failed to load", e);
    } finally {
      this.loading = false;
    }
  }
  updateRowNums() {
    let i = 1;
    this.dataSource.data.forEach(el => el["position"] = i++);
  }

  onRefresh() {
    this.load();
  }

  onRowClick($event: MouseEvent, app: AppInfo) {
    if (!this.onTableRowClick($event)) return;
    if (app.status === 'invalid') return;
    this.router.navigate(['/apps', app.configId, 'edit']);
  }

  async deleteConfig(config: AppInfo) {
    this.errorMessage = null;
    const dialogRef = this.confirm(`Are you sure to delete the configuration "${config.name}"?`);
    let result = await dialogRef.afterClosed().toPromise();
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

  async createConfig() {
    let result = await this.dialog.open(NewAppDialogComponent, {}).afterClosed().toPromise();
    if (result) {
      this.errorMessage = null;
      this.loading = true;
      try {
        let appInfo = await this.configService.createApp(result.name, result.appId);
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
