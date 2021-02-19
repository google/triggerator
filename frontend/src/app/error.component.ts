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
    let error = this.route.snapshot.queryParamMap.get('error');
    if (error === ERRORS.AUTH_COOKIES_NOT_ENABLED) {
      this.message = 'Cookies are disabled (are you in Incognito mode?) and so Google Sign-In cannot work.';
    }
  }

}
