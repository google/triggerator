import { Component, OnInit, AfterViewInit } from '@angular/core';
import { Router, Event, NavigationStart, NavigationEnd, NavigationError, NavigationCancel } from '@angular/router';
import { AuthService } from './shared/auth.service';
import { BackendService } from './shared/backend.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit {
  loading: boolean;
  //appTitle = 'Triggerator';
  //spreadsheetUri = 'https://docs.google.com/spreadsheets/d/1fnxjMudPpiHz0XezAmdFjvD2QCYi6IvgluDLpxYs8-M/edit';

  constructor(private backendService: BackendService, private authService: AuthService, router: Router) {
    router.events.subscribe((routerEvent: Event) => {
      if (routerEvent instanceof NavigationStart) {
        this.loading = true;
      } else if (routerEvent instanceof NavigationEnd ||
                routerEvent instanceof NavigationError ||
                routerEvent instanceof NavigationCancel) {
        this.loading = false;
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    await this.authService.init();
    /*let res = this.backendService.getConfig(this.spreadsheetUri).then(
      (title) => {
        console.log('title: ' + title);
      }
    );
    */
  }
}
