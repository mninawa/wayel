import { APP_INITIALIZER, Provider, inject } from '@angular/core';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { catchError, firstValueFrom, of } from 'rxjs';
import { environment } from '../../environments/environment';
import { CustomerAccountService } from '../services/customer-account.service';

/** Loads WeYell account state after BFF/session bootstrap (API mode only). */
export function provideCustomerAccountBootstrap(): Provider[] {
  if (environment.useMock) {
    return [];
  }

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
