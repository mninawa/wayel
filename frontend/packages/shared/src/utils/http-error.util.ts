import { HttpErrorResponse } from '@angular/common/http';

/** Short message for platform list / dashboard error banners. */
export function platformHttpErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Network error — is the API running and CORS/proxy configured?';
    }
    if (typeof err.error === 'string' && err.error.length < 200) {
      return `${err.status}: ${err.error}`;
    }
    return `${err.status}: ${err.statusText || 'Request failed'}`;
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
