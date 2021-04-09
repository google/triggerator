import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, fromEvent, Subject } from 'rxjs';

export const SCROLL_CONTAINER = '.mat-drawer-content';

@Component({
  selector: 'tr-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent implements OnInit, OnDestroy {
  applyShadow: boolean;
  isCollapsed: boolean;
  private _subScroll: Subscription;

  constructor(private router: Router) { }

  ngOnInit() {
    const container = document.querySelector(SCROLL_CONTAINER);
    if (container) {
      this._subScroll = fromEvent(container, 'scroll')      
        .subscribe(_ => this.determineHeader(container.scrollTop));
    }
  }

  ngOnDestroy() {
    this._subScroll.unsubscribe();
  }

  determineHeader(top: number) {

  }
}