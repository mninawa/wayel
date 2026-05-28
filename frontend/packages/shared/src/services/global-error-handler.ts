import { ErrorHandler, Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  isChunkLoadFailure,
  tryReloadAfterChunkLoadFailure,
} from '@wayel/shared/utils/chunk-load-recovery';
import { ToastService } from './toast.service';

/**
 * Catches uncaught runtime errors thrown anywhere in the app and surfaces
 * them as a toast. Logs the full error to the console so it remains
 * debuggable. Provide via `{ provide: ErrorHandler, useClass: GlobalErrorHandler }`.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly toasts = inject(ToastService);

  handleError(error: unknown): void {
    console.error('[GlobalErrorHandler]', error);

    // HttpErrorResponse is already surfaced by the http-error-interceptor —
    // avoid double-toasting it.
    if (error instanceof HttpErrorResponse) return;

    if (isChunkLoadFailure(error)) {
      if (tryReloadAfterChunkLoadFailure()) {
        return;
      }

      this.toasts.error('A new version of the app is available. Please refresh the page.', {
        title: 'Update required',
      });
      return;
    }

    const message = this.messageFor(error);
    if (!message) return;
    this.toasts.error(message, { title: 'Something went wrong' });
  }

  private messageFor(error: unknown): string | null {
    if (!error) return null;
    if (typeof error === 'string') return error;
    const maybe = error as { message?: unknown; rejection?: unknown };
    if (typeof maybe.message === 'string' && maybe.message.trim()) {
      return maybe.message;
    }
    if (maybe.rejection) return this.messageFor(maybe.rejection);
    try {
      return String(error);
    } catch {
      return 'An unexpected error occurred.';
    }
  }
}
