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
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, fromEvent, Subject } from 'rxjs';

export const SCROLL_CONTAINER = '.mat-drawer-content';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent /*implements OnInit, OnDestroy */ {
  applyShadow: boolean;
  isCollapsed: boolean;
  private _subScroll: Subscription;

  constructor(private router: Router) { }
  /*
  TODO: smart sticky header - https://egghead.io/lessons/angular-create-an-extended-header-using-angular-material-toolbars
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
  */
}
