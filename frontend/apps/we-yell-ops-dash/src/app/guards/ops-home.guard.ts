import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OpsSessionService } from '../services/ops-session.service';

/** Sends signed-in users to their first allowed workspace (receiving vs collection). */
export const opsHomeRedirectGuard: CanActivateFn = () => {
  const router = inject(Router);
  const session = inject(OpsSessionService);
  return router.createUrlTree([session.homePath()]);
};
