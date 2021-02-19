import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { AboutComponent } from './about.component';
import { AppEditorComponent } from './app-editor.component';
import { AppsListComponent } from './apps-list.component';
import { ErrorComponent } from './error.component';
import { LoginComponent } from './login.component';
import { SettingsComponent } from './settings.component';

const routes: Routes = [
  { path: 'apps', component: AppsListComponent },
  { path: 'apps/:id/edit', component: AppEditorComponent },
  { path: 'settings', component: SettingsComponent },
  { path: 'about', component: AboutComponent },
  { path: 'login', component: LoginComponent },
  { path: 'error', component: ErrorComponent },
  { path: '', redirectTo: 'apps', pathMatch: 'full' },
  //{ path: '**', component: PageNotFoundComponent }
  //{ path: 'about', loadChildren: () => import('./about/about.module').then(m => m.AboutModule) },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
