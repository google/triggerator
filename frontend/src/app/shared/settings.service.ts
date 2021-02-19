import { Injectable } from "@angular/core";

export interface Settings {
  //title: string;
  spreadsheetUrl: string;
}
const LOCALSTORAGE_KEY = 'g-triggerator-master-spreadsheet_id';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {

  get(): Settings {
    let settings = {
      spreadsheetUrl: ""
    };
    settings.spreadsheetUrl = localStorage.getItem(LOCALSTORAGE_KEY) || "1fnxjMudPpiHz0XezAmdFjvD2QCYi6IvgluDLpxYs8-M";
    return settings;
  }

  update(settings: Settings) {
    localStorage.setItem(LOCALSTORAGE_KEY, settings.spreadsheetUrl);
  }
}