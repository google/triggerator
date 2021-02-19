/// <reference types="gapi" />
/// <reference types="gapi.auth2" />
import { Injectable, Output, EventEmitter, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from "./../../environments/environment";
//const CLIENT_ID = '816635099889-0t4plrdikd99ltg8kjqqg0sqjlaovgcu.apps.googleusercontent.com';
//const CLIENT_SECRET = 'N9_7b9hQgiizexi4i5-iS-NR';
//const CLIENT_ID = '24659510846-kmsf41qfskk964l64rkqggovkrb2s0k8.apps.googleusercontent.com';  // google: segy-codelabs

const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];

export interface AuthChangedEvent {
  signedIn: boolean;
  user?: string;
}
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  isAuthenticated = false;
  @Output() authChanged: EventEmitter<AuthChangedEvent> = new EventEmitter<AuthChangedEvent>();
  redirectUrl: string;
  authPromise: Promise<boolean>;

  constructor(private router: Router, private ngZone: NgZone) {}

  async init(): Promise<boolean> {
    this.authPromise = new Promise((resolve, reject) => {
      //  Create a new Promise where the resolve 
      // function is the callback passed to gapi.load
      // const pload = new Promise((resolve) => {
      //   gapi.load('client:auth2', resolve);
      // });
      // await pload;

      gapi.load('client:auth2', () => {
        gapi.client.init({
          clientId: environment.clientId,
          scope: SCOPES,
          discoveryDocs: DISCOVERY_DOCS
        }).then(() => {
          gapi.auth2.getAuthInstance().isSignedIn.listen(this.onSigninStatusChanged.bind(this));
  
          // Handle the initial sign-in state.
          const isSignedIn = gapi.auth2.getAuthInstance().isSignedIn.get();
          this.onSigninStatusChanged(isSignedIn);
          resolve(isSignedIn);
        }, (reason) => {
          console.log('gapi failed to initialize: ' + reason.details);
          reject(reason);
        });
      });

    })
    return this.authPromise;    
  }

  onSigninStatusChanged(isSignedIn: boolean) {
    this.ngZone.run(() => {
      this.isAuthenticated = isSignedIn;
    
      if (isSignedIn) {
        
        let user = gapi.auth2.getAuthInstance().currentUser.get();
        let id = user.getBasicProfile().getId();
        let email = user.getBasicProfile().getEmail();
        let name = user.getBasicProfile().getName();
        
        console.log(`logged in: ${email}`);
        this.authChanged.emit({signedIn: true, user: name});
  
        if (this.redirectUrl) {
          this.redirectUrl = '';
          this.router.navigateByUrl(this.redirectUrl);
        }
      } else {
        this.authChanged.emit({signedIn: false});
      }
      });
  }

  logout() {
    gapi.auth2.getAuthInstance().signOut();
    gapi.auth2.getAuthInstance().disconnect();
    this.router.navigate(['/login']);
  }
  
  async login() {
    await this.authPromise;
    let user = await gapi.auth2.getAuthInstance().signIn({
      prompt: 'select_account'
    });
  }

  get currentUser(): gapi.auth2.GoogleUser {
    return gapi.auth2.getAuthInstance().currentUser.get();
  }
}