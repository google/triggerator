/// <reference types="gapi.client.sheets" />
import { Injectable } from "@angular/core";
import { AuthService } from "./auth.service";
import { Config, AppList, FeedConfig, FeedInfo, JobInfo } from '../../../../backend/src/types/config';
import { BackendService } from "./backend.service";

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  constructor(private backendService: BackendService) { }

  getConfig(configId: string): Promise<Config> {
    return this.backendService.getApi<Config>('/config/' + configId);
  }

  getAppList(): Promise<AppList> {
    return this.backendService.getApi<AppList>('/apps/list');
  }
  createApp(name: string, appId?: string) {
    return this.backendService.postApi(`/apps/create`, {name, appId});
  }
  deleteApp(appId: string) {
    return this.backendService.postApi(`/apps/${appId}/delete`);
  }

  updateConfig(configId: string, config: Config) {
    return this.backendService.postApi('/config/' + (configId ? configId : 'new'), config);
  }

  saveConfig(configId: string, updated: Config, original: Config) {
    return this.backendService.postApi(`/config/${configId}/stream`, {
      updated: updated,
      original: original
    });
  }

  validateRules(configId: string) {
    return this.backendService.getApi(`/config/${configId}/rules/validate`);
  }

  generateSdf(configId: string, update: boolean, autoActivate: boolean) {
    return this.backendService.getFile(`/config/${configId}/sdf/generate`, {
      update: update,
      autoActivate: autoActivate
    });
  }

  downloadFile(configId: string, filename: string) {
    return this.backendService.getFile(`/config/${configId}/sdf/download`, {
      file: filename
    });
  }

  loadFeed(configId: string, feedName: string): Promise<Record<string, any>[]> {
    return this.backendService.getApi(`/config/${configId}/feeds/${feedName}`);
  }

  loadAllFeeds(configId: string, evaluateRules: boolean): Promise<{data:Record<string, any>[], effeective_rules: string[]}> {
    return this.backendService.getApi(`/config/${configId}/feeds/_all_`, {evaluateRules});
  }

  updateSchedule(configId: string, job: JobInfo) {
    return this.backendService.postApi(`/config/${configId}/schedule/edit`, job);
  }

  loadSchedule(configId: string): JobInfo | PromiseLike<JobInfo> {
    return this.backendService.getApi(`/config/${configId}/schedule`);
  }

  runExecution(configId: string) {
    return this.backendService.postApi(`/engine/${configId}/run`);
  }

  // async loadAppList(): Promise<{ apps?: IAppConfig[], error?: string }> {
  //   let settings = this.settingsService.get();
  //   if (!settings || !settings.spreadsheetUrl) {
  //     return { error: 'Master spreadsheet id isn\'t specified' };
  //   }
  //   return new Promise((resolve) => {
  //     gapi.client.sheets.spreadsheets.values.get({
  //       spreadsheetId: settings.spreadsheetUrl,
  //       range: 'Main!A2:H',
  //     }).then((response) => {
  //       var range = response.result;
  //       let apps: IAppConfig[] = [];
  //       if (range.values.length > 0) {
  //         for (let i = 0; i < range.values.length; i++) {
  //           var row = range.values[i];
  //           let app: IAppConfig = {
  //             name: row[0],
  //             spreadsheetId: row[1],
  //             version: row[2]
  //           };
  //           apps.push(app);
  //         }
  //       }
  //       resolve({ apps: apps });;
  //     }, (response) => {
  //       let error = response.result.error;
  //       let errorMessage: string;
  //       console.log(`Fetch of ${settings.spreadsheetUrl} failed: ${error.message}`);
  //       if (error.status === 'PERMISSION_DENIED') {
  //         let userName = this.authService.currentUser?.getBasicProfile().getEmail();
  //         errorMessage = `You don\'t have access permissions for the Spreadsheet (${settings.spreadsheetUrl}). Please choose a different one in <a href="/settings">Settings</a> or add permissions for your account ${userName}`;
  //       } else {
  //         errorMessage = error.message;
  //       }

  //       resolve({ error: errorMessage });
  //     });
  //   });
  // }
}