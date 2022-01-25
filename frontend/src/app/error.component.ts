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
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

export enum ERRORS {
  AUTH_COOKIES_NOT_ENABLED = 'AUTH_COOKIES_NOT_ENABLED'
}
@Component({
  templateUrl: './error.component.html',
  styleUrls: ['./error.component.css']
})
export class ErrorComponent implements OnInit {
  message: string;

  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    const error = this.route.snapshot.queryParamMap.get('error');
    if (error === ERRORS.AUTH_COOKIES_NOT_ENABLED) {
      this.message = 'Cookies are disabled (are you in Incognito mode?) and so Google Sign-In cannot work.';
    }
  }
}
