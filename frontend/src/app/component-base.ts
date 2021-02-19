import { MatDialog, MatDialogRef } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ConfirmationDialogComponent, ConfirmationDialogModes } from "./components/confirmation-dialog.component";

export class ComponentBase {
  errorMessage: string;

  constructor(
    public dialog: MatDialog,
    private snackBar: MatSnackBar) {

  }
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
    let snackBarRef = this.snackBar.open(message, 'Dismiss', {
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
        message: message, 
        mode: ConfirmationDialogModes.YesNo} 
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
    if ((<any>$event.target).tagName === "A") return false;
    // ignore click on button
    let el = <any>$event.target;
    do {
      if ((el).tagName === 'BUTTON') return false;
      el = el.parentElement;
    } while (el && el !== $event.currentTarget)

    return true;
  }
}