import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { BackendService } from './shared/backend.service';
import { NavbarComponent } from './navbar/navbar.component';
import { AppsListComponent } from './apps-list.component';
import { SettingsComponent } from './settings.component';
import { AboutComponent } from './about.component';
import { AppMaterialModule } from './app-material.module';
import { AppEditorComponent } from './app-editor.component';
import { ErrorComponent } from './error.component';
import { CoreModule } from './core.module';
import { FeedEditorDialogComponent } from './feed-editor-dialog.component';
import { RulesListComponent } from './rules-list.component';
import { RuleEditorDialogComponent } from './rule-editor-dialog.component';
import { NewAppDialogComponent } from './new-app-dialog.component';
import { EditValueDialogComponent } from './components/edit-value-dialog.component';
import { EventListComponent } from './event-list.component';

@NgModule({
  declarations: [
    AppComponent, 
    NavbarComponent, AppsListComponent, AppEditorComponent, SettingsComponent, 
    AboutComponent, ErrorComponent, FeedEditorDialogComponent, 
    RulesListComponent, RuleEditorDialogComponent, NewAppDialogComponent, 
    EditValueDialogComponent, EventListComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppMaterialModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    AppRoutingModule,
    CoreModule
  ],
  providers: [BackendService],
  bootstrap: [AppComponent]
})
export class AppModule { }
