import { APP_INITIALIZER, Provider, inject } from '@angular/core';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { catchError, firstValueFrom, of } from 'rxjs';
import { CustomerAccountService } from '../services/customer-account.service';

/** Loads WeYell account state after BFF/session bootstrap. */
export function provideCustomerAccountBootstrap(): Provider[] {
  return [
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const journey = inject(CustomerAccountService);
        const session = inject(AccountSessionService);
        return () => {
          if (!session.isSignedIn()) {
            return Promise.resolve();
          }
          return firstValueFrom(journey.loadAccount().pipe(catchError(() => of(null))));
        };
      },
    },
  ];
}
