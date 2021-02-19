import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, fromEvent, Subject } from 'rxjs';
import { AuthChangedEvent, AuthService } from '../shared/auth.service';

export const SCROLL_CONTAINER = '.mat-drawer-content';

@Component({
  selector: 'tr-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  applyShadow: boolean;
  //no_accounts
  isCollapsed: boolean;
  isAuthenticated: boolean;
  userName: string;
  private _subAuth: Subscription;
  private _subScroll: Subscription;

  constructor(private router: Router,
    private authservice: AuthService) { }

  ngOnInit() {
    const container = document.querySelector(SCROLL_CONTAINER);
    if (container) {
      this._subScroll = fromEvent(container, 'scroll')      
        .subscribe(_ => this.determineHeader(container.scrollTop));
    }

    this._subAuth = this.authservice.authChanged
      .subscribe((evnt: AuthChangedEvent) => {
        this.setLoginLogoutStatus(evnt);
      },
        (err: any) => console.log(err));
  }

  ngOnDestroy() {
    this._subScroll.unsubscribe();
    this._subAuth.unsubscribe();
  }

  determineHeader(top: number) {

  }

  loginOrOut() {
    const isAuthenticated = this.authservice.isAuthenticated;
    if (isAuthenticated) {
      this.authservice.logout();
      //this.setLoginLogoutStatus(isAuthenticated);
      //this.growler.growl('Logged Out', GrowlerMessageType.Info);      
    } else {
      //this.redirectToLogin();
      this.authservice.login();
    }
  }

  private setLoginLogoutStatus(evnt: AuthChangedEvent) {
    this.isAuthenticated = evnt.signedIn;
    this.userName = evnt.user;
    //this.loginLogoutText = (this.authservice.isAuthenticated) ? 'Logout' : 'Login';
  }

}