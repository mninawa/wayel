import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { OpsRegion } from '../services/ops-regions';
import { OpsSessionService } from '../services/ops-session.service';

export function opsRegionGuard(...required: OpsRegion[]): CanActivateFn {
  return () => {
    const session = inject(OpsSessionService);
    const router = inject(Router);

    if (required.some((region) => session.hasRegion(region))) {
      return true;
    }

    return router.createUrlTree([session.homePath()]);
  };
}
