import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Config, RuleInfo } from '../../../backend/src/types/config';
import { ComponentBase } from './component-base';
import { ConfigService } from './shared/config.service';

@Component({
  templateUrl: './rule-editor-dialog.component.html',
  styleUrls: ['./rule-editor-dialog.component.css']
})
export class RuleEditorDialogComponent extends ComponentBase implements OnInit {
  form: FormGroup;
  loading: boolean;
  configId: string;
  config: Config;
  rule: RuleInfo | undefined;
  public periodTypes = [
    { value: 'day', title: 'Day' },
    { value: 'week', title: 'Week' },
    { value: 'month', title: 'Month' }
  ]
  periodTypes1: ['day', 'week', 'month'];

  constructor(
    private dialogRef: MatDialogRef<RuleEditorDialogComponent>,
    dialog: MatDialog,
    snackBar: MatSnackBar,
    private fb: FormBuilder,
    private configService: ConfigService,
    @Inject(MAT_DIALOG_DATA) public data: { configId: string, rule: RuleInfo, config: Config }) {
    super(dialog, snackBar)
    this.configId = data.configId;
    this.config = data.config;
    this.rule = data.rule;
    let rule = data.rule || {
      name: undefined,
      condition: undefined
    };
    let display_io_frequency = this.parseFrequency(rule.display_state?.frequency_io);
    let display_li_frequency = this.parseFrequency(rule.display_state?.frequency_li);
    let yt_io_frequency = this.parseFrequency(rule.youtube_state?.frequency_io);
    let yt_li_frequency = this.parseFrequency(rule.youtube_state?.frequency_li);
    this.form = this.fb.group({
      name: [rule.name, [Validators.required]],
      condition: [rule.condition, [Validators.required]],
      // display:
      display_bid: rule.display_state?.bid,
      display_creatives: rule.display_state?.creatives,
      display_io_frequency_value: display_io_frequency.value,
      display_io_frequency_period: display_io_frequency.period,
      display_li_frequency_value: display_li_frequency.value,
      display_li_frequency_period: display_li_frequency.period,
      // youtube:
      yt_bid: rule.youtube_state?.bid,
      yt_creatives: rule.youtube_state?.creatives,
      yt_io_frequency_value: yt_io_frequency.value,
      yt_io_frequency_period: yt_io_frequency.period,
      yt_li_frequency_value: yt_li_frequency.value,
      yt_li_frequency_period: yt_li_frequency.period,
    });
  }

  private parseFrequency(freq: string) {
    var f = /(\d+)\/(week|day|month)/.exec(freq);
    if (!f)
      return { value: '', period: '' };
    return {
      value: f[1],
      period: f[2]
    }
  }

  private getFrequency(val: any, period: string) {
    if (!isNaN(val) && period) {
      return `${val}/${period}`;
    }
    return undefined;
  }

  ngOnInit(): void {
  }

  async save() {
    // TODO: validation: name, type, url
    this.loading = true;
    try {
      let rules = this.config.rules.slice();
      let rule = this.rule;
      let creating: boolean = false;
      if (!rule) {
        creating = true;
        // creating a new rule
        rule = {
          name: undefined,
          condition: undefined
        };
        this.updateRuleData(rule);
        rules.push(rule);
      } else {
        // editing an existing
        this.updateRuleData(rule);
      }
      // NOTE: do NOT pass original config because we don't need to calc the diff for rules array, 
      // we overwrite rules (and feeds) array on every save
      try {
        await this.configService.saveConfig(this.configId, { rules: rules }, null);
      } catch (e) {
        this.handleApiError("Rules failed to save", e);
        return;
      }
      if (creating) 
        this.config.rules.push(rule);
      this.dialogRef.close(rule);
    } catch (e) {
      // todo
    } finally {
      this.loading = false;
    }
  }
  private updateRuleData(rule: RuleInfo) {
    let result = this.form.value;
    rule.name = result.name;
    rule.condition = result.condition;
    rule.display_state = result.display_state;
    rule.youtube_state = result.youtube_state;
    // display
    rule.display_state = rule.display_state || {};
    rule.display_state.bid = result.display_bid;
    rule.display_state.creatives = result.display_creatives;
    rule.display_state.frequency_io = this.getFrequency(result.display_io_frequency_value, result.display_io_frequency_period);
    rule.display_state.frequency_li = this.getFrequency(result.display_li_frequency_value, result.display_li_frequency_period);
    // youtube:
    rule.youtube_state = rule.youtube_state || {};
    rule.youtube_state.bid = result.yt_bid;
    rule.youtube_state.creatives = result.yt_creatives;
    rule.youtube_state.frequency_io = this.getFrequency(result.yt_io_frequency_value, result.yt_io_frequency_period);
    rule.youtube_state.frequency_li = this.getFrequency(result.yt_li_frequency_value, result.yt_li_frequency_period);
  }

}
