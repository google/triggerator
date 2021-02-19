import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, Router } from '@angular/router';
import { Observable } from 'rxjs';
import { ERRORS } from '../error.component';
import { AuthService } from '../shared/auth.service';

@Injectable({
  providedIn: 'root'
})
export class DefaultRouteGuard implements CanActivate {
  constructor(private authservice: AuthService, private router: Router) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {

    if (!this.authservice.isAuthenticated) {
      return new Promise<boolean>((resolve) => {
        this.authservice.authPromise.then(isSignedIn => {
          if (isSignedIn) {
            resolve(true);
            return;
          }
          this.authservice.redirectUrl = state.url;
          this.router.navigate(['/login']);
          resolve(false);
        }).catch((reason) => {
          // details:'Cookies are not enabled in current environment.'
          if (reason && reason.details && reason.details.search(/Cookies are not enabled/i) >= 0) {
            this.authservice.redirectUrl = state.url;
            this.router.navigate(['/error'], { queryParams: { error: ERRORS.AUTH_COOKIES_NOT_ENABLED }});
            resolve(false);
          } else {
            this.authservice.redirectUrl = state.url;
            this.router.navigate(['/login']);
            resolve(false);
            }
        });
      });
      // this.authservice.redirectUrl = state.url;
      // this.router.navigate(['/login']);
      // return false;
    }

    // TODO: check master Spreadsheet existence, if it's not specified,
    // redirect to Settings page, otherwise go to AppsList
    return true;
  }
  
}
