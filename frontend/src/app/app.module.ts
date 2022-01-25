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
import { JsonPipe } from './components/json.pipe';
import { ObjectDetailsDialogComponent } from './components/object-details-dialog.component';
import { CustomFieldsComponent } from './custom-fields.component';
import { FeedJoinWizardDialogComponent } from './feed-join-wizard-dialog.component';

@NgModule({
  declarations: [
    AppComponent,
    NavbarComponent, AppsListComponent, AppEditorComponent, SettingsComponent,
    AboutComponent, ErrorComponent, FeedEditorDialogComponent,
    RulesListComponent, RuleEditorDialogComponent, NewAppDialogComponent,
    EditValueDialogComponent, EventListComponent,
    JsonPipe, ObjectDetailsDialogComponent, CustomFieldsComponent, FeedJoinWizardDialogComponent
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
