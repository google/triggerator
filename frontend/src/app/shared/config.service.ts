import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { Config, AppList, FeedConfig, FeedInfo, JobInfo } from '../../../../backend/src/types/config';
import { BackendService } from "./backend.service";

export interface GenerateSdfOptions {
  update: boolean,
  autoActivate: boolean,
  startDate?: string,
  endDate?: string,
}
@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  constructor(public backendService: BackendService) { }

  getSettings() {
    return this.backendService.getApi<{settings:Record<string,string>}>('/settings');
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

  getConfig(configId: string): Promise<Config> {
    return this.backendService.getApi<Config>('/config/' + configId);
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

  generateSdf(configId: string, options: GenerateSdfOptions) {
    return this.backendService.getFile(`/config/${configId}/sdf/generate`, options);
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

  runExecution(configId: string): Observable<string> {
    return this.backendService.getEvents(`/engine/${configId}/run/stream`);
  }
}