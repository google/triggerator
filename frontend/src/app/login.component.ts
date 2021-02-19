import { Component, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  templateUrl: './login.component.html'
})
export class LoginComponent implements AfterViewInit {

  constructor(private router: Router) { }

  ngAfterViewInit(): void {
    this.renderButton();
  }

  renderButton() {
    //prompt: 'select_account'
    gapi.signin2.render('signin-btn', {
      'scope': 'profile email',
      'width': 240,
      'height': 50,
      'longtitle': true,
      'theme': 'dark',
      'onsuccess': this.onSuccess.bind(this),
      'onfailure': this.onFailure.bind(this)
    });
  }

  private onSuccess() {
    this.router.navigate(['']);
  }
  private onFailure() {
    //alert('failure');
  }
}
