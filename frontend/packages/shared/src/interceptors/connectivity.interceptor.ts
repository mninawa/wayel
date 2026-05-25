import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { ConnectivityService } from '../services/connectivity.service';

/** Marks the BFF/API reachable after any successful proxied response. */
export const connectivityInterceptor: HttpInterceptorFn = (req, next) => {
  const connectivity = inject(ConnectivityService);
  const track =
    req.url.includes('/api/') || req.url.includes('/bff/');

  return next(req).pipe(
    tap({
      next: () => {
        if (track) {
          connectivity.markServerReachable();
        }
      },
      error: (err: unknown) => {
        if (
          track
          && err instanceof HttpErrorResponse
          && err.status === 0
        ) {
          connectivity.markServerUnreachable();
        }
      },
    }),
  );
};
