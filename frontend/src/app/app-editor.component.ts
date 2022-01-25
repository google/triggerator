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
import * as _ from 'lodash';
import { AfterViewInit, Component, OnDestroy, OnInit, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Config, DV360TemplateInfo, FeedInfo, FeedType, Feed_BigQuery_Url_RegExp, JobInfo, ReportFormat, SDF_VERSION } from '../../../backend/src/types/config';
import { ConfigService } from './shared/config.service';
import { FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
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
import { ObjectDetailsDialogComponent } from './components/object-details-dialog.component';
import { ConfirmationDialogComponent, ConfirmationDialogModes } from './components/confirmation-dialog.component';
import { FeedJoinWizardDialogComponent } from './feed-join-wizard-dialog.component';

@Component({
  selector: 'app-app-editor',
  templateUrl: './app-editor.component.html',
  styleUrls: ['./app-editor.component.scss']
})
export class AppEditorComponent extends ComponentBase implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('feedDataPanel') feedDataPanel: MatExpansionPanel;
  @ViewChildren('feedDataPaginator') paginatorFeedData: QueryList<MatPaginator>;
  @ViewChild(MatTabGroup) tabGroup: MatTabGroup;

  appId: string;
  config: Config;
  autoSave: boolean = true;
  evaluateRulesWithFeeds: boolean = true;
  loading: boolean;

  formGeneral: FormGroup;
  formSdf: FormGroup;
  formFeeds: FormGroup;
  formExecution: FormGroup;
  formReports: FormGroup;
  scheduleLink: string;
  timeZones: string[] = timezones;
  timeZonesFiltered: Observable<string[]>;

  /** datasource of feeds (definitions) */
  dataSourceFeeds: MatTableDataSource<FeedInfo>;
  /** columns of list of feeds */
  feedsColumns: string[] = ['name', 'type', 'url', 'charset', 'key_column', 'external_key', 'actions'];
  /** map of datasources with data of all feeds */
  dataSourceFeedData: Record<string, MatTableDataSource<any>>;
  /** map feed name to its columns */
  feedDataColumns: Record<string, string[]>;
  ngUnsubscribe: Subject<void> = new Subject<void>();

  undoStack = [];

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
      Result: new MatTableDataSource<any>()
    };
    this.feedDataColumns = {
      Result: []
    };
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
      enable: null,
      runDebugLogging: null,
      runSendEmail: null,
      runForceUpdate: null,
      dryRun: null
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
    this.formReports = this.fb.group({
      reportPeriod: this.fb.group({
        start: null,
        end: null
      }),
      format: ReportFormat.CSV,
      ownerUser: null,
      excludeEmpty: null,
      destination_folder: null
    });
    this.appId = this.route.snapshot.paramMap.get('id');
    this.formGeneral.valueChanges
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(values => {
        if (this.autoSave) {
          const updated = _.cloneDeep(this.config);
          _.extend(updated.execution, values);
          this.reactiveSave(updated);
        }
      });
    this.formExecution.valueChanges
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(values => {
        const schedule = values.schedule;
        if (schedule) {
          this.scheduleLink = schedule.replace(/ /g, '_');
        }
        if (values.enable) {
          this.formExecution.get('schedule').enable({ emitEvent: false, onlySelf: true });
          this.formExecution.get('timeZone').enable({ emitEvent: false, onlySelf: true });
        } else {
          this.formExecution.get('schedule').disable({ emitEvent: false, onlySelf: true });
          this.formExecution.get('timeZone').disable({ emitEvent: false, onlySelf: true });
        }
        // prevent appearing of "there are unsaved changes" notification for switches
        if (values.hasOwnProperty('runDebugLogging')) {
          this.formExecution.controls.runDebugLogging.markAsPristine();
        }
        if (values.hasOwnProperty('runSendEmail')) {
          this.formExecution.controls.runSendEmail.markAsPristine();
        }
        if (values.hasOwnProperty('runForceUpdate')) {
          this.formExecution.controls.runForceUpdate.markAsPristine();
        }
        if (values.hasOwnProperty('dryRun')) {
          this.formExecution.controls.dryRun.markAsPristine();
        }
      });

    // intellisence for entering TimeZone
    this.timeZonesFiltered = this.formExecution.controls.timeZone.valueChanges
      .pipe(
        startWith(''),
        map((value) => {
          const filterValue = value ? value.toLowerCase() : '';
          return this.timeZones.filter(option => option.toLowerCase().indexOf(filterValue) >= 0);
        })
      );

    this.formSdf.valueChanges
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(values => {
        if (this.autoSave) {
          const updated = _.cloneDeep(this.config);
          _.extend(updated.dv360Template, values);
          this.reactiveSave(updated);
        }
      });
    this.formFeeds.valueChanges
      .pipe(takeUntil(this.ngUnsubscribe))
      .subscribe(values => {
        if (values.hasOwnProperty('name_column')) {
          setTimeout(() => {
            this.formFeeds.controls.name_column.markAsPending({ emitEvent: false, onlySelf: true });
          }, 0);
        }
        if (values.hasOwnProperty('geo_code_column')) {
          setTimeout(() => {
            this.formFeeds.controls.geo_code_column.markAsPending({ emitEvent: false, onlySelf: true });
          }, 0);
        }
        if (values.hasOwnProperty('budget_factor_column')) {
          setTimeout(() => {
            this.formFeeds.controls.budget_factor_column.markAsPending({ emitEvent: false, onlySelf: true });
          }, 0);
        }
        if (this.autoSave) {
          const updated = _.cloneDeep(this.config);
          _.extend(updated.feedInfo, values);
          this.reactiveSave(updated);
        }
      });
    this.load();
  }

  ngAfterViewInit() {
    this.dataSourceFeedData['Result'].paginator = this.paginatorFeedData.first;
    this.formFeeds.controls.name_column.markAsPending({ emitEvent: false, onlySelf: true });
    this.formFeeds.controls.geo_code_column.markAsPending({ emitEvent: false, onlySelf: true });
    this.formFeeds.controls.budget_factor_column.markAsPending({ emitEvent: false, onlySelf: true });
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
    config.feedInfo.feeds = config.feedInfo.feeds || [];
    config.rules = config.rules || [];
    config.customFields = config.customFields || [];
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
    this.formFeeds.controls.name_column.markAsPending({ emitEvent: false, onlySelf: true });
    this.formFeeds.controls.geo_code_column.markAsPending({ emitEvent: false, onlySelf: true });
    this.formFeeds.controls.budget_factor_column.markAsPending({ emitEvent: false, onlySelf: true });
  }

  refresh() {
    this.load();
  }

  save() {
    this.errorMessage = null;
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
      this.saveState();
      this.config = updated;
    }, (e) => {
      this.handleApiError('Save failed', e);
    });
  }

  saveState(original?: Config) {
    this.undoStack.push(_.cloneDeep(original ?? this.config));
  }

  undo() {
    if (this.undoStack.length > 0) {
      let newState = this.undoStack.pop();
      let oldState = _.cloneDeep(this.config);
      this.config = newState;
      this.updateFormValues();
      this.configService.saveConfig(this.appId, newState, oldState).catch((e) => {
        this.handleApiError('Failed to save restore state, please save manually', e);
      });
    }
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
          this.showSnackbar('Saved');
        }, (e) => {
          this.handleApiError('Save failed', e);
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
    );
  }

  // General Tab
  async sendTestEmail() {
    this.loading = true;
    try {
      await this.configService.sendTestEmail(this.formGeneral.get('notificationEmails').value);
      this.showSnackbar('Email sent');
    } catch (e) {
      this.handleApiError('Failed to sent an email', e);
    } finally {
      this.loading = false;
    }
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
      // remove dirty
      this.formExecution.markAsPristine();
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
      const job: JobInfo = await this.configService.loadSchedule(this.appId);
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
      if (job.schedule) {
        this.scheduleLink = job.schedule.replace(/ /g, '_')
      }
      this.showSnackbar('Configuration loaded');
    } catch (e) {
      this.handleApiError('Couldn\'t load schedule', e);
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
    if (this.executing) return;
    const debugLogging = this.formExecution.get('runDebugLogging').value;
    const sendNotification = this.formExecution.get('runSendEmail').value;
    const forceUpdate = this.formExecution.get('runForceUpdate').value;
    const dryRun = this.formExecution.get('dryRun').value;

    try {
      this.executing = true;
      this.eventList.addMessage('Starting execution');
      this.eventList.open();
      this.configService.runExecution(
        this.appId, {
        debugLogging,
        sendNotification,
        forceUpdate,
        dryRun
      }).subscribe({
        next: (msg) => {
          this.eventList.addMessage(msg);
        },
        error: (msg) => {
          this.executing = false;
          this.eventList.addMessage(msg);
          this.eventList.addMessage('<span class="text-danger">Execution failed</span>');
          this.showSnackbar('Execution failed');
        },
        complete: () => {
          this.executing = false;
          this.eventList.addMessage('<span class="text-success">Execution completed</span>');
          this.showSnackbar('Execution completed');
        }
      });
    } catch (e) {
      // we don't expect an error here, but just in case
      console.error(e);
      this.executing = false;
    }
  }

  get SdfVersionName(): string {
    return SDF_VERSION;
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
    return this.doGenerateSdf(false);
  }

  updateSdf() {
    if (!this.config.execution?.campaignId) {
      this.showAlert('To update a SDF you first need to create a campaign and specify its id on General tab in "Campaign Id" field');
      return;
    }

    return this.doGenerateSdf(true);
  }

  private async doGenerateSdf(update: boolean) {
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

  generateDefaultTemplates() {
    let dv360Template: DV360TemplateInfo = {
      io_template: "{base_name}",
      li_template: "{base_name}-{row_name}-{rule_name}",
      yt_li_template: "{base_name}-{row_name}-{rule_name}",
      yt_io_template: "{base_name}",
      adgroup_template: "{base_name}",
      ad_template: "{base_name}"
    };
    this.formSdf.patchValue({
      io_template: dv360Template.io_template,
      li_template: dv360Template.li_template,
      yt_io_template: dv360Template.yt_io_template,
      yt_li_template: dv360Template.yt_li_template,
      adgroup_template: dv360Template.adgroup_template,
      ad_template: dv360Template.ad_template,
    }, { emitEvent: true });
  }

  // Feeds Tab
  onFeedRowClick($event: MouseEvent, feed: FeedInfo) {
    if (!this.onTableRowClick($event)) { return; }
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
        const original = _.cloneDeep(this.config);
        feed.name = result.name;
        feed.type = result.type;
        feed.url = result.url;
        feed.charset = result.charset;
        feed.key_column = result.key_column;
        feed.external_key = result.external_key;
        this.saveFeeds(original);
      }
    });
  }

  deleteFeed(feed: FeedInfo) {
    const dialogRef = this.confirm(`Are you sure to delete the feed "${feed.name}"?`);
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        //console.log(result);
        const original = _.cloneDeep(this.config);
        this.config.feedInfo.feeds.splice(this.config.feedInfo.feeds.indexOf(feed), 1);
        this.dataSourceFeeds.data = this.config.feedInfo.feeds;
        this.saveFeeds(original);
      }
    });
  }

  createFeed() {
    const dialogRef = this.dialog.open(FeedEditorDialogComponent, {
      width: '600px',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const feed: FeedInfo = {
          name: result.name,
          type: result.type,
          url: result.url,
          charset: result.charset,
          key_column: result.key_column,
          external_key: result.external_key
        };
        const original = _.cloneDeep(this.config);
        this.config.feedInfo.feeds.push(feed);
        this.dataSourceFeeds.data = this.dataSourceFeeds.data;
        this.saveFeeds(original);
      }
    });
  }

  async saveFeeds(original: Config) {
    const feeds = this.config.feedInfo.feeds.slice();
    let updated = { feedInfo: { feeds } };
    try {
      await this.configService.saveConfig(this.appId, updated, null);
      this.saveState(original);
    } catch (e) {
      this.handleApiError('Configuration failed to save', e);
    }
  }

  async loadFeed(feed: FeedInfo) {
    try {
      this.errorMessage = null;
      this.loading = true;
      const data = await this.configService.loadFeed(this.appId, feed.name);
      this.showFeedData(data, feed.name);
    } catch (e) {
      this.handleApiError(`Feed ${feed.name} failed to load`, e);
    } finally {
      this.loading = false;
    }
  }

  async loadAllFeeds() {
    try {
      this.errorMessage = null;
      this.loading = true;
      const result = await this.configService.loadAllFeeds(this.appId, this.evaluateRulesWithFeeds);
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

  async defineJoins() {
    let columns_all = {};
    let feeds_to_load = [];
    for (const feed of this.config.feedInfo.feeds) {
      let columns = this.feedDataColumns[feed.name];
      if (columns) {
        columns_all[feed.name] = columns;
      } else {
        feeds_to_load.push(feed);
      }
    }
    if (feeds_to_load.length > 0) {
      for (const feed of feeds_to_load) {
        await this.loadFeed(feed);
        let columns = this.feedDataColumns[feed.name];
        if (columns) {
          columns_all[feed.name] = columns;
        } else {
          console.log(`Could not load columns for feed ${feed.name}`);
        }
      }
    }
    const dialogRef = this.dialog.open(FeedJoinWizardDialogComponent, {
      //width: '600px',
      data: { feedInfo: this.config.feedInfo, columns: columns_all }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log(result);
        const original = _.cloneDeep(this.config);
        for (const feed_result of result.feeds) {
          let feed: FeedInfo = this.config.feedInfo.feeds.find(f => f.name === feed_result.name);
          if (feed) {
            feed.key_column = feed_result.key_column;
            feed.external_key = feed_result.external_key;
          }
        }
        this.saveFeeds(original);
      }
    });
  }

  getFeedDisplayUrl(feed: FeedInfo): string {
    // https://console.cloud.google.com/bigquery?project=triggerator-sd&page=table&d=test&p=triggerator-sd&t=gsk-feed
    if (feed.type === FeedType.GoogleCloudBigQuery) {
      // projects/triggerator-sd/datasets/test/views/gsk-feed
      // projects/triggerator-sd/datasets/test/tables/test
      // projects/triggerator-sd/datasets/test/procedures/test_proc
      let rePath = new RegExp(Feed_BigQuery_Url_RegExp);
      let match = rePath.exec(feed.url);
      if (!match || !match.groups) {
        return feed.url;
      }

      let projectId = match.groups['project'];
      let datasetId = match.groups['dataset'];
      let tableId = match.groups['table'];
      let viewId = match.groups['view'];
      let procedure = match.groups['proc']
      let href = '';
      if (procedure) {
        href = `https://console.cloud.google.com/bigquery?project=${projectId}&page=routine&d=${datasetId}&p=${projectId}&r=${procedure}`;
      } else {
        let name = tableId ? tableId : viewId;
        href = `https://console.cloud.google.com/bigquery?project=${projectId}&page=table&d=${datasetId}&p=${projectId}&t=${name}`;
      }
      return href;
    }
    return feed.url;
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
    const ds = this.dataSourceFeedData[dataSetName];
    ds.data = [];
    if (!feedData || !feedData.length) { return; }
    // filter out columns with array data (we create special field $feed_name for access fields by index)
    this.feedDataColumns[dataSetName] = Object.keys(feedData[0]).filter(name => !name.startsWith('$'));
    ds.data = feedData;
    this.feedDataPanel.open();
    this.tabsFeedDataSelected = this.tabsFeedData.indexOf(dataSetName);
  }

  getFeedDataColumns() {
    return this.feedDataColumns['Result'];
  }

  onFeedRowDetails($event: MouseEvent, row: any, index: number, ds: MatTableDataSource<any>) {
    if (!this.onTableRowClick($event)) { return; }
    const dialogRef = this.dialog.open(ObjectDetailsDialogComponent, {
      width: '600px',
      data: {
        row,
        index,
        dataSource: ds
      }
    });
  }

  removeFeedDataTab(tabName: string) {
    const index = this.tabsFeedData.indexOf(tabName);
    this.tabsFeedData.splice(index, 1);
    delete this.dataSourceFeedData[tabName];
    delete this.feedDataColumns[tabName];
    this.tabsFeedDataSelected = 0;

  }

  mouseOverIndex = -1;
  validateColumn(object: any, path: string): boolean {
    const parts = path.split('.');
    for (let i = 0; i < parts.length - 1; i++) {
      object = object[parts[i]];
      if (!object) return false;
    }
    if (!object) return false;
    return object.hasOwnProperty(parts[parts.length - 1]);
  }

  validateFeedColumns() {
    const data = this.dataSourceFeedData['Result'].data;
    if (!data || !data.length) {
      this.showAlert('Please load feeds data first by pressing "Preview" button in the Feeds list');
      return;
    }
    const columns = this.formFeeds.value;
    let name_column = columns.name_column;
    let geo_code_column = columns.geo_code_column;
    let budget_factor_column = columns.budget_factor_column;
    let row = data[0];
    // name_columns
    this.formFeeds.controls.name_column.setErrors(null);
    if (!name_column) {
      this.formFeeds.controls.name_column.setErrors({ required: true });
    } else if (!this.validateColumn(row, name_column)) {
      this.formFeeds.controls.name_column.setErrors({ unknownColumn: true });
    }
    this.formFeeds.getError('required')
    // geo_code_column
    this.formFeeds.controls.geo_code_column.setErrors(null);
    if (!geo_code_column) {
      this.formFeeds.controls.geo_code_column.setErrors({ required: true });
    } else if (!this.validateColumn(row, geo_code_column)) {
      this.formFeeds.controls.geo_code_column.setErrors({ unknownColumn: true });
    }
    // budget_factor_column
    this.formFeeds.controls.budget_factor_column.setErrors(null);
    if (budget_factor_column && !this.validateColumn(row, budget_factor_column)) {
      this.formFeeds.controls.budget_factor_column.setErrors({ unknownColumn: true });
    }
  }

  // Reports tab
  async buildReport() {
    const dates = this.formReports.get('reportPeriod').value;

    if (!dates.start) {
      this.formReports.get('reportPeriod.start').setErrors({ invalid: true });
      return;
    }
    if (!dates.end) {
      this.formReports.get('reportPeriod.end').setErrors({ invalid: true });
      return;
    }
    let format = this.formReports.get('format').value;
    let excludeEmpty = this.formReports.get('excludeEmpty').value;
    let ownerUser = this.formReports.get('ownerUser').value;
    let destination_folder = this.formReports.get('destination_folder').value;

    this.errorMessage = null;
    this.loading = true;
    try {
      let result = await this.configService.buildReport(this.appId, format, {
        from: dates?.start?.toISOString(),
        to: dates?.end?.toISOString(),
        format: format.toString().toLowerCase(),
        excludeEmpty,
        ownerUser,
        destination_folder
      });
      if (format === ReportFormat.Spreadsheet) {
        let docurl = `https://docs.google.com/spreadsheets/d/${result.fileId}`;
        console.log('Report generated: ' + docurl);
        const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
          data: {
            html: `Report has been successfully built, please open the <a target='_blank' href='${docurl}'>Spreadsheet</a> to make sure you have access`,
            header: 'Report',
            mode: ConfirmationDialogModes.Ok
          }
        });
      }
    } catch (e) {
      this.handleApiError('Report generation failed', e);
    } finally {
      this.loading = false;
    }
  }
}


