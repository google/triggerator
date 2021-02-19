import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgForm } from '@angular/forms';
import { SettingsService, Settings } from './shared/settings.service';

@Component({
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {

  //@ViewChild(NgForm) settingsForm: NgForm;
  settings: Settings;
  errorMessage: string;

  constructor(private route: ActivatedRoute, private settingService: SettingsService) { }

  ngOnInit(): void {
    this.route.parent.data.subscribe(data => {
      // if (this.settingsForm) {
      //   this.settingsForm.reset();
      // }

      //this.product = data['resolvedData'].spreadsheetUrl;
    });
    this.settings = this.settingService.get();
  }

  isValid(): boolean {
    if (!this.settings.spreadsheetUrl)
      return false;
    return true;
  }

  save() {
    this.settingService.update(this.settings);
  }
}
