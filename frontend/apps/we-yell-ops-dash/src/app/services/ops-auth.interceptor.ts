import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { OpsSessionService } from './ops-session.service';

/** Sign out when ops API returns 401 (expired or invalid warehouse token). */
export const opsAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const isOpsApi =
    req.url.includes('/borderbox/ops/') &&
    !req.url.includes('/borderbox/ops/auth/google') &&
    !req.url.includes('/borderbox/ops/auth/invitations/preview');

  if (!isOpsApi) {
    return next(req);
  }

  const session = inject(OpsSessionService);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && session.isConnected()) {
        session.disconnect();
      }
      return throwError(() => err);
    }),
  );
};
