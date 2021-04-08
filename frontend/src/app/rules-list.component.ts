import { Overlay } from '@angular/cdk/overlay';
import { Component, Input, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { Config, RuleInfo } from '../../../backend/src/types/config';
import { ComponentBase } from './component-base';
import { ConfirmationDialogComponent, ConfirmationDialogModes } from './components/confirmation-dialog.component';
import { RuleEditorDialogComponent } from './rule-editor-dialog.component';
import { ConfigService } from './shared/config.service';

@Component({
  selector: 'tr-rules-list',
  templateUrl: './rules-list.component.html',
  styleUrls: ['./rules-list.component.scss']
})
export class RulesListComponent implements OnInit {
  dataSource: MatTableDataSource<RuleInfo>;
  columnsToDisplay = ['name', 'condition', 'actions'];

  constructor(private dialog: MatDialog,
    private configService: ConfigService,
    private overlay: Overlay) {
    this.dataSource = new MatTableDataSource<RuleInfo>();
  }
  @Input() appId: string;

  _data: Config;
  @Input() set data(config: Config) {
    this._data = config;
    if (config) {
      config.rules = config.rules || [];
      this.dataSource.data = config.rules;
    }
  }
  @Input() parent: ComponentBase;

  ngOnInit(): void {
  }

  validate() {
    // TODO: execute rules
    //let result = this.configService.validateRules(this.appId);

  }

  createRule() {
    const dialogRef = this.dialog.open(RuleEditorDialogComponent, {
      width: '600px',
      data: {
        configId: this.appId,
        config: this._data
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // let rule: RuleInfo = {
        //   name: '',
        //   condition: ''
        // };
        //this.updateRuleWithEditorResults(rule, result);
        //this._data.rules.push(rule);
        this.dataSource.data = this._data.rules;
        //this.saveRules()
      }
    });
  }

  editRule(rule: RuleInfo) {
    const dialogRef = this.dialog.open(RuleEditorDialogComponent, {
      width: '600px',
      data: {
        configId: this.appId,
        config: this._data,
        rule: rule
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log(result);
        this.dataSource.data = this._data.rules;
        //this.updateRuleWithEditorResults(rule, result);
        //this.saveRules();
      }
    });
  }



  deleteRule(rule: RuleInfo) {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        message: `Are you sure to delete the rule "${rule.name}"?`,
        mode: ConfirmationDialogModes.YesNo
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        console.log(result);
        let idx2del = this._data.rules.indexOf(rule);
        let rules = this._data.rules.slice();
        rules.splice(idx2del, 1);
        try {
          this.configService.saveConfig(this.appId, { rules: rules }, null);
        } catch(e) {
          this.parent.handleApiError('Deletion failed', e);
          return;
        }
        // if server save successful then update load data
        this._data.rules.splice(idx2del, 1);
        this.dataSource.data = this._data.rules;
        //this.saveRules();
      }
    });
  }

  // saveRules() {
  //   let rules = this._data.rules.slice();
  //   this.configService.saveConfig(this.appId, { rules: rules }, null);
  // }

}