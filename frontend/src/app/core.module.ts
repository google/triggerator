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
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProgressSpinnerComponent } from './components/progress-spinner.component';
import { OverlayService } from './components/overlay.service';
import { AppMaterialModule } from './app-material.module';
import { ConfirmationDialogComponent } from './components/confirmation-dialog.component';

@NgModule({
  imports: [
    CommonModule,
    AppMaterialModule
  ],
  declarations: [ProgressSpinnerComponent, ConfirmationDialogComponent],
  exports: [ProgressSpinnerComponent, ConfirmationDialogComponent],
  providers: [OverlayService]
})
export class CoreModule { }
