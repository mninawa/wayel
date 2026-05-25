import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';

export const parcelOpsGuard: CanActivateFn = () => {
  if (environment.enableParcelReceive) {
    return true;
  }
  return inject(Router).createUrlTree(['/dashboard']);
};
