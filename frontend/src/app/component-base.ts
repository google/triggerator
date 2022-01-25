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
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Config } from '../../../backend/src/types/config';
import { ConfirmationDialogComponent, ConfirmationDialogModes } from './components/confirmation-dialog.component';

export abstract class ComponentBase {
  errorMessage: string;

  constructor(
    public dialog: MatDialog,
    private snackBar: MatSnackBar) {

  }
  saveState(original?: Config) {};

  handleApiError(message, e) {
    let details = e.message;
    let error = e;
    if (e.error) {
      error = e.error;
      details = e.error.error;
    }
    this.errorMessage = message + (details ? ": " + details : "");
    this.showSnackbarWithError(message, error);
  }

  showSnackbarWithError(message: string, e) {
    let snackBarRef = this.snackBar.open(message, 'Details', {
      duration: 4000,
    });
    snackBarRef.onAction().subscribe(() => {
      snackBarRef.dismiss();
      snackBarRef = this.snackBar.open(JSON.stringify(e), 'Dismiss', {
        duration: 6000,
      });
      snackBarRef.onAction().subscribe(() => {
        snackBarRef.dismiss();
      });
    });
  }

  showSnackbar(message: string) {
    const snackBarRef = this.snackBar.open(message, 'Dismiss', {
      duration: 4000,
    });
    snackBarRef.onAction().subscribe(() => {
      snackBarRef.dismiss();
    });
  }

  closeErrorMessage() {
    this.errorMessage = null;
  }

  confirm(message: string) {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        message,
        mode: ConfirmationDialogModes.YesNo
      }
    });
    return dialogRef;
  }

  showAlert(message: string): MatDialogRef<ConfirmationDialogComponent> {
    return this.dialog.open(ConfirmationDialogComponent, {
      data: {
        message: message,
        mode: ConfirmationDialogModes.Ok
      }
    });
  }

  onTableRowClick($event: MouseEvent): boolean {
    // ignore click on links
    if ((<any>$event.target).tagName === 'A') { return false; }
    // ignore click on button
    let el = <any>$event.target;
    do {
      if ((el).tagName === 'BUTTON') { return false; }
      el = el.parentElement;
    } while (el && el !== $event.currentTarget);

    return true;
  }
}
