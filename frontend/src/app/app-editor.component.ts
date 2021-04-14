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
import * as _ from 'lodash';
import { AfterViewInit, Component, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Config, FeedInfo, JobInfo } from '../../../backend/src/types/config';
import { ConfigService } from './shared/config.service';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { FeedEditorDialogComponent } from './feed-editor-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatExpansionPanel } from '@angular/material/expansion';
import { MatPaginator } from '@angular/material/paginator';
import { MatTabGroup } from '@angular/material/tabs';
import { ComponentBase } from './component-base';
import { EditValueDialogComponent } from './components/edit-value-dialog.component';
import { EventListComponent } from './event-list.component';
import timezones from './timezones';
import { Observable, Subject } from 'rxjs';
import { map, startWith, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-app-editor',
  templateUrl: './app-editor.component.html',
  styleUrls: ['./app-editor.component.scss']
})
export class AppEditorComponent extends ComponentBase implements OnInit, AfterViewInit {
  appId: string;
  config: Config;
  autoSave: boolean = true;
  evaluateRulesWithFeeds: boolean = true;
  loading: boolean;

  formGeneral: FormGroup;
  formSdf: FormGroup;
  formFeeds: FormGroup;
  formExecution: FormGroup;
  scheduleLink: string;
  timeZones: string[] = timezones;
  timeZonesFiltered: Observable<string[]>;

  dataSourceFeeds: MatTableDataSource<FeedInfo>;
  feedsColumns: string[] = ['name', 'type', 'url', 'charset', 'key_column', 'external_key', 'actions'];
  dataSourceFeedData: Record<string, MatTableDataSource<any>>;
  feedDataColumns: Record<string, string[]>;
  @ViewChild("feedDataPanel") feedDataPanel: MatExpansionPanel;
  @ViewChildren('feedDataPaginator') paginatorFeedData: QueryList<MatPaginator>;
  @ViewChild(MatTabGroup) tabGroup: MatTabGroup;
  ngUnsubscribe: Subject<void> = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private configService: ConfigService,
    dialog: MatDialog,
    snackBar: MatSnackBar
  ) {
    super(dialog, snackBar);
    this.dataSourceFeeds = new MatTableDataSource<FeedInfo>();
    this.dataSourceFeedData = {
      'Result': new MatTableDataSource<any>()
    }
    this.feedDataColumns = {
      'Result': []
    }
  }

  async ngOnInit(): Promise<void> {
    this.formGeneral = this.fb.group({
      advertiserId: [null, Validators.required],
      campaignId: [null],
      notificationEmails: [null],
    }, { updateOn: 'blur' });
    this.formExecution = this.fb.group({
      schedule: { value: null, disabled: true },
      timeZone: { value: null, disabled: true },
      enable: null
    });
    this.formSdf = this.fb.group({
      template_campaign: null,
      campaign_name: null,
      total_budget: null,
      io_template: null,
      li_template: null,
      yt_io_template: null,
      yt_li_template: null,
      adgroup_template: null,
      ad_template: null,
      activateCampaign: null,
      newCampaignPeriod: this.fb.group({
        start: null,
        end: null
      }),
      destination_folder: null
    }, { updateOn: 'blur' });
    this.formFeeds = this.fb.group({
      name_column: null,
      geo_code_column: null,
      budget_factor_column: null
    }, { updateOn: 'blur' });

    this.appId = this.route.snapshot.paramMap.get('id');
    this.formGeneral.valueChanges
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(values => {
        if (this.autoSave) {
          let updated = _.cloneDeep(this.config);
          _.extend(updated.execution, values);
          this.reactiveSave(updated);
        }
      });
    this.formExecution.valueChanges
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(values => {
        let schedule = values['schedule'];
        if (schedule) {
          this.scheduleLink = schedule.replace(/ /g, "_");
        }
        if (values['enable']) {
          this.formExecution.get('schedule').enable({ emitEvent: false, onlySelf: true });
          this.formExecution.get('timeZone').enable({ emitEvent: false, onlySelf: true });
        } else {
          this.formExecution.get('schedule').disable({ emitEvent: false, onlySelf: true });
          this.formExecution.get('timeZone').disable({ emitEvent: false, onlySelf: true });
        }
      });
    this.timeZonesFiltered = this.formExecution.controls['timeZone'].valueChanges
      .pipe(
        startWith(''),
        map((value) => {
          const filterValue = value.toLowerCase();
          return this.timeZones.filter(option => option.toLowerCase().indexOf(filterValue) >= 0);
        })
      );

    this.formSdf.valueChanges
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(values => {
        if (this.autoSave) {
          let updated = _.cloneDeep(this.config);
          _.extend(updated.dv360Template, values);
          this.reactiveSave(updated);
        }
      });
    this.formFeeds.valueChanges
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(values => {
        if (values.hasOwnProperty('name_column')) {
          setTimeout(() => {
            this.formFeeds.controls['name_column'].markAsPending({ emitEvent: false, onlySelf: true });
          }, 0);
        }
        if (values.hasOwnProperty('geo_code_column')) {
          setTimeout(() => {
            this.formFeeds.controls['geo_code_column'].markAsPending({ emitEvent: false, onlySelf: true });
          }, 0);
        }
        if (values.hasOwnProperty('budget_factor_column')) {
          setTimeout(() => {
            this.formFeeds.controls['budget_factor_column'].markAsPending({ emitEvent: false, onlySelf: true });
          }, 0);
        }
        if (this.autoSave) {
          let updated = _.cloneDeep(this.config);
          _.extend(updated.feedInfo, values);
          this.reactiveSave(updated);
        }
      });
    this.load();
  }

  ngAfterViewInit() {
    this.dataSourceFeedData['Result'].paginator = this.paginatorFeedData.first;
    this.formFeeds.controls['name_column'].markAsPending({ emitEvent: false, onlySelf: true });
    this.formFeeds.controls['geo_code_column'].markAsPending({ emitEvent: false, onlySelf: true });
    this.formFeeds.controls['budget_factor_column'].markAsPending({ emitEvent: false, onlySelf: true });
  }

  ngOnDestroy() {
    if (this.ngUnsubscribe) {
      this.ngUnsubscribe.next();
      this.ngUnsubscribe.complete();
    }
  }

  private async load() {
    this.errorMessage = null;
    this.loading = true;
    let config: Config;
    try {
      config = await this.configService.getConfig(this.appId);
    } catch (e) {
      this.loading = false;
      this.handleApiError('Configuration failed to load', e);
      return;
    }
    // actually we expect all these sections in config to be returned by the server, but just in case
    config.execution = config.execution || {};
    config.dv360Template = config.dv360Template || {};
    config.feedInfo = config.feedInfo || {};
    this.config = config;
    this.updateFormValues();
    this.loading = false;
  }

  private updateFormValues() {
    this.formGeneral.patchValue({
      advertiserId: this.config.execution.advertiserId,
      campaignId: this.config.execution.campaignId,
      notificationEmails: this.config.execution.notificationEmails
    }, { emitEvent: false });
    this.formSdf.patchValue({
      template_campaign: this.config.dv360Template.template_campaign,
      campaign_name: this.config.dv360Template.campaign_name,
      total_budget: this.config.dv360Template.total_budget,
      io_template: this.config.dv360Template.io_template,
      li_template: this.config.dv360Template.li_template,
      yt_io_template: this.config.dv360Template.yt_io_template,
      yt_li_template: this.config.dv360Template.yt_li_template,
      adgroup_template: this.config.dv360Template.adgroup_template,
      ad_template: this.config.dv360Template.ad_template,
      destination_folder: this.config.dv360Template.destination_folder
    }, { emitEvent: false });
    this.formFeeds.patchValue({
      name_column: this.config.feedInfo.name_column,
      geo_code_column: this.config.feedInfo.geo_code_column,
      budget_factor_column: this.config.feedInfo.budget_factor_column
    }, { emitEvent: false });
    this.dataSourceFeeds.data = this.config.feedInfo.feeds || [];
    this.formFeeds.controls['name_column'].markAsPending({ emitEvent: false, onlySelf: true });
    this.formFeeds.controls['geo_code_column'].markAsPending({ emitEvent: false, onlySelf: true });
    this.formFeeds.controls['budget_factor_column'].markAsPending({ emitEvent: false, onlySelf: true });
  }

  refresh() {
    this.load();
  }

  save() {
    this.loading = true;
    try {
      this.configService.updateConfig(this.appId, this.config);
    } catch (e) {
      this.handleApiError('Configuration failed to save', e);
    } finally {
      this.loading = false;
    }
  }

  private reactiveSave(updated: Config) {
    this.configService.saveConfig(this.appId, updated, this.config).then(() => {
      // TODO: update config with values
      this.config = updated;
    });
  }

  editTitle() {
    const dialogRef = this.dialog.open(EditValueDialogComponent, {
      width: '400px',
      data: {
        label: 'Title',
        value: this.config?.title
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result !== this.config?.title) {
        this.loading = true;
        this.configService.saveConfig(this.appId, { title: result }, { title: this.config?.title }).then(() => {
          this.config.title = result;
          this.loading = false;
          this.showSnackbar("Saved");
        });
      }
    });
  }

  close() {
    this.router.navigateByUrl('/apps');
  }

  switchToTab(tabName) {
    this.tabGroup._tabs.some(
      (tab, index) => {
        if (tab.textLabel === tabName) {
          this.tabGroup.selectedIndex = index;
          return true;
        }
      }
    )
  }

  // Execution Tab
  async saveSchedule() {
    this.loading = true;
    try {
      await this.configService.updateSchedule(this.appId, {
        enable: this.formExecution.get('enable').value,
        schedule: this.formExecution.get('schedule').value,
        timeZone: this.formExecution.get('timeZone').value,
      });
      this.showSnackbar('Configuration updated');
    } catch (e) {
      this.handleApiError('Schedule failed to save', e);
    } finally {
      this.loading = false;
    }
  }

  async loadSchedule() {
    this.loading = true;
    try {
      let job: JobInfo = await this.configService.loadSchedule(this.appId);
      // this.formExecution.patchValue({
      //   enable: job.enable,
      //   schedule: job.schedule,
      //   timeZone: job.timeZone
      // });
      this.formExecution.reset({
        enable: job.enable,
        schedule: job.schedule,
        timeZone: job.timeZone
      });
      this.showSnackbar('Configuration loaded');
    } catch (e) {
      this.handleApiError("Couldn't load schedule", e);
    } finally {
      this.loading = false;
    }
  }

  executing: boolean;
  @ViewChild(EventListComponent) eventList: EventListComponent;
  runExecution() {
    // TODO: save
    //       validate
    // try {
    //   await this.configService.backendService.postApi(`/engine/${this.appId}/run`);
    // } catch (e) {
    //   this.handleApiError('fail', e);
    // }
    // return;
    try {
      this.executing = true;
      this.eventList.addMessage(`Starting execution`);
      this.eventList.open();
      this.configService.runExecution(this.appId).subscribe({
        next: (msg) => {
          this.eventList.addMessage(msg);
        },
        error: (msg) => {
          this.executing = false;
          this.eventList.addMessage(msg);
          this.eventList.addMessage("Execution failed");
          this.showSnackbar("Execution failed");
        },
        complete: () => {
          this.executing = false;
          this.eventList.addMessage("Execution completed");
          this.showSnackbar("Execution completed");
        }
      });
    } catch (e) {
      // we don't expect an error here, but just in case
    } finally {
      this.executing = false;
    }
  }

  // Generate SDF Tab
  generateSdf() {
    // TODO: validate:
    //  templates
    //  template campaigns
    //  dates
    //  new campaign name
    //  feeds
    //  rulles
    return this._generateSdf(false);
  }

  updateSdf() {
    if (!this.config.execution?.campaignId) {
      this.showAlert('To update a SDF you first need to create a campaign and specify its id on General tab in "Campaign Id" field');
      return;
    }

    return this._generateSdf(true);
  }

  private async _generateSdf(update: boolean) {
    const autoActivate = this.formSdf.get('activateCampaign').value;
    const dates = this.formSdf.get('newCampaignPeriod').value;
    if (!update) {
      // start/end dates are mandatory for a campaign creation
      if (!dates.start || Date.now > dates.start) {
        this.formSdf.get('newCampaignPeriod.start').setErrors({ invalid: true });
        return;
      }
      if (!dates.end || Date.now > dates.end) {
        this.formSdf.get('newCampaignPeriod.end').setErrors({ invalid: true });
        return;
      }
    }

    this.errorMessage = null;
    this.loading = true;
    try {
      await this.configService.generateSdf(this.appId, {
        update,
        autoActivate: !!autoActivate,
        startDate: dates?.start?.toISOString(),
        endDate: dates?.end?.toISOString()
      });
      //await this.configService.downloadFile(this.appId, 'sdf-20210325T172548091Z.zip');
    } catch (e) {
      this.handleApiError('SDF generation failed', e);
    } finally {
      this.loading = false;
    }
  }

  // Feeds Tab
  onFeedRowClick($event: MouseEvent, feed: FeedInfo) {
    if (!this.onTableRowClick($event)) return;
    this.editFeed(feed);
  }

  editFeed(feed: FeedInfo) {
    const dialogRef = this.dialog.open(FeedEditorDialogComponent, {
      width: '600px',
      data: feed
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log(result);
        feed.name = result.name;
        feed.type = result.type;
        feed.url = result.url;
        feed.charset = result.charset;
        feed.key_column = result.key_column;
        feed.external_key = result.external_key;
        this.saveFeeds();
      }
    });
  }

  deleteFeed(feed: FeedInfo) {
    const dialogRef = this.confirm(`Are you sure to delete the feed "${feed.name}"?`);
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log(result);
        this.config.feedInfo.feeds.splice(this.config.feedInfo.feeds.indexOf(feed), 1);
        this.dataSourceFeeds.data = this.config.feedInfo.feeds;
        this.saveFeeds();
      }
    });
  }

  createFeed() {
    const dialogRef = this.dialog.open(FeedEditorDialogComponent, {
      width: '600px',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        let feed: FeedInfo = {
          name: result.name,
          type: result.type,
          url: result.url,
          charset: result.charset,
          key_column: result.key_column,
          external_key: result.external_key
        };
        this.config.feedInfo.feeds.push(feed);
        this.dataSourceFeeds.data = this.dataSourceFeeds.data;
        this.saveFeeds()
      }
    });

  }

  saveFeeds() {
    let feeds = this.config.feedInfo.feeds.slice();
    try {
      this.configService.saveConfig(this.appId, { feedInfo: { feeds: feeds } }, null);
    } catch (e) {
      this.handleApiError('Configuration failed to save', e);
    }
  }

  async loadFeed(feed: FeedInfo) {
    try {
      this.loading = true;
      let data = await this.configService.loadFeed(this.appId, feed.name);
      this.showFeedData(data, feed.name);
    } catch (e) {
      this.handleApiError(`Feed ${feed.name} failed to load`, e);
    } finally {
      this.loading = false;
    }
  }

  async loadAllFeeds() {
    try {
      this.loading = true;
      let result = await this.configService.loadAllFeeds(this.appId, this.evaluateRulesWithFeeds);
      if (!result) {
        this.showSnackbar('No data returned');
        return;
      }
      if (result.effeective_rules && result.effeective_rules.length) {
        for (let i = 0; i < result.effeective_rules.length; i++) {
          result.data[i]['Rule'] = result.effeective_rules[i];
        }
      }
      this.showFeedData(result.data, 'Result');
    } catch (e) {
      this.handleApiError(`Feeds failed to load`, e);
    } finally {
      this.loading = false;
    }
  }

  tabsFeedData = ['Result'];
  tabsFeedDataSelected = 0;
  showFeedData(feedData: Record<string, any>[], dataSetName: string) {
    if (this.tabsFeedData.indexOf(dataSetName) === -1) {
      // new tab
      this.tabsFeedData.push(dataSetName);
      this.dataSourceFeedData[dataSetName] = new MatTableDataSource<any>();
      setTimeout(() => {
        this.dataSourceFeedData[dataSetName].paginator = this.paginatorFeedData.toArray()[this.tabsFeedData.indexOf(dataSetName)];
      });
    }
    let ds = this.dataSourceFeedData[dataSetName];
    ds.data = [];
    if (!feedData || !feedData.length) return;
    this.feedDataColumns[dataSetName] = Object.keys(feedData[0]).filter(name => !name.startsWith("$"));
    ds.data = feedData;
    this.feedDataPanel.open();
    this.tabsFeedDataSelected = this.tabsFeedData.indexOf(dataSetName);
  }

  removeFeedDataTab(tabName: string) {
    let index = this.tabsFeedData.indexOf(tabName);
    this.tabsFeedData.splice(index, 1);
    delete this.dataSourceFeedData[tabName];
    delete this.feedDataColumns[tabName];
    this.tabsFeedDataSelected = 0;

  }

  mouseOverIndex = -1;

  validateFeedColumns() {
    let data = this.dataSourceFeedData['Result'].data;
    if (!data || !data.length) {
      this.showAlert('Please load feeds data first by pressing "Preview" button in the Feeds list');
      return;
    }
    let columns = this.formFeeds.value;
    let name_column = columns["name_column"];
    let geo_code_column = columns["geo_code_column"];
    let budget_factor_column = columns["budget_factor_column"];
    let row = data[0];
    // name_columns
    this.formFeeds.controls['name_column'].setErrors(null);
    if (!name_column)
      this.formFeeds.controls['name_column'].setErrors({ required: true });
    else if (!row[name_column])
      this.formFeeds.controls['name_column'].setErrors({ unknownColumn: true });
    this.formFeeds.getError('required')
    // geo_code_column
    this.formFeeds.controls['geo_code_column'].setErrors(null);
    if (!geo_code_column)
      this.formFeeds.controls['geo_code_column'].setErrors({ required: true });
    else if (!row[geo_code_column])
      this.formFeeds.controls['geo_code_column'].setErrors({ unknownColumn: true });
    // budget_factor_column
    this.formFeeds.controls['budget_factor_column'].setErrors(null);
    if (!budget_factor_column)
      this.formFeeds.controls['budget_factor_column'].setErrors({ required: true });
    else if (!row[budget_factor_column])
      this.formFeeds.controls['budget_factor_column'].setErrors({ unknownColumn: true });
  }
}


