import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';

/** Blocks the internal KYC ops UI unless enabled in environment (dev/local). */
export const kycOpsReviewGuard: CanActivateFn = () => {
  if (environment.enableKycOpsReview) {
    return true;
  }
  return inject(Router).createUrlTree(['/dashboard']);
};
