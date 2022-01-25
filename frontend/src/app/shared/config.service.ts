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
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Config, AppList, JobInfo, ReportFormat } from '../../../../backend/src/types/config';
import { BackendService } from './backend.service';

export interface GenerateSdfOptions {
  update: boolean;
  autoActivate: boolean;
  startDate?: string;
  endDate?: string;
}
@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  constructor(public backendService: BackendService) { }

  getSettings() {
    return this.backendService.getApi<{ settings: Record<string, string> }>('/settings');
  }

  getAppList(): Promise<AppList> {
    return this.backendService.getApi<AppList>('/apps/list');
  }

  createApp(name: string, appId?: string) {
    return this.backendService.postApi(`/apps/create`, { name, appId });
  }

  deleteApp(appId: string) {
    return this.backendService.postApi(`/apps/${appId}/delete`);
  }

  cloneApp(appId: string) {
    return this.backendService.postApi(`/apps/${appId}/clone`);
  }

  getConfig(configId: string): Promise<Config> {
    return this.backendService.getApi<Config>('/config/' + configId);
  }

  updateConfig(configId: string, config: Config) {
    return this.backendService.postApi('/config/' + (configId ? configId : 'new'), config);
  }

  saveConfig(configId: string, updated: Config, original: Config) {
    return this.backendService.postApi(`/config/${configId}/stream`, {
      updated,
      original
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

  loadAllFeeds(configId: string, evaluateRules: boolean): Promise<{ data: Record<string, any>[]; effeective_rules: string[] }> {
    return this.backendService.getApi(`/config/${configId}/feeds/_all_`, { evaluateRules });
  }

  updateSchedule(configId: string, job: JobInfo) {
    return this.backendService.postApi(`/config/${configId}/schedule/edit`, job);
  }

  loadSchedule(configId: string): JobInfo | PromiseLike<JobInfo> {
    return this.backendService.getApi(`/config/${configId}/schedule`);
  }

  runExecution(configId: string, options?: { debugLogging?: boolean, sendNotification?: boolean, forceUpdate?: boolean, dryRun?: boolean }): Observable<string> {
    return this.backendService.getEventsLegacy(
      `/engine/${configId}/run/legacy`,
      {
        debug: options?.debugLogging,
        notify: options?.sendNotification,
        forceUpdate: options?.forceUpdate,
        dryRun: options?.dryRun
      }
    );
    //return this.backendService.getEvents(`/engine/${configId}/run/stream`, {debug: options?.debugLogging});
  }

  buildReport(configId: string, format: ReportFormat, options: Record<string,string>): any {
    if (format === ReportFormat.CSV) {
      return this.backendService.getFile(`/reports/${configId}/activationtimes`, options);
    } else {
      return this.backendService.getApi(`/reports/${configId}/activationtimes`, options);
    }
  }

  shareSpreadsheets() {
    return this.backendService.postApi('/settings/reshare');
  }

  sendTestEmail(emails?: string) {
    return this.backendService.postApi('/settings/send-test-email', { emails });
  }
}
