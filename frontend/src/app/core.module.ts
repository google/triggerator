import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { ProgressSpinnerComponent } from './components/progress-spinner.component';
import { OverlayService } from './components/overlay.service';
import { AppMaterialModule } from './app-material.module';
//export { ProgressSpinnerComponent } from './components/progress-spinner.component';
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