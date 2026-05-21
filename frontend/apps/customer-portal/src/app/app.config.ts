import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, Provider, inject } from '@angular/core';
import { provideRouter, TitleStrategy, withInMemoryScrolling } from '@angular/router';
import { accountAuthInterceptor } from '@wayel/shared/interceptors/account-auth.interceptor';
import {
  HTTP_ERROR_CONFIG,
  httpErrorInterceptor,
} from '@wayel/shared/interceptors/http-error.interceptor';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import {
  BFF_SESSION_SINK,
  BffAuthService,
} from '@wayel/shared/services/bff-auth.service';
import { provideBffAuthBootstrap } from '@wayel/shared/services/bff-auth.bootstrap';
import { GlobalErrorHandler } from '@wayel/shared/services/global-error-handler';
import { ExternalBffSessionSink } from './auth/external-bff-session-sink';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideCustomerAccountBootstrap } from './providers/account-bootstrap';
import { provideBorderboxMockBootstrap } from './providers/mock-bootstrap';
import { WayelTitleStrategy } from './title-strategy';

/**
 * In BFF mode (`environment.useBffAuth`) we add three things on top of the
 * existing mock email/password wiring:
 *
 *   1. `BFF_SESSION_SINK` is bound to `ExternalBffSessionSink` so a successful
 *      `/bff/auth/me` mirrors the identity into `AccountSessionService` —
 *      the existing `AuthenticatedShellComponent` and parent/staff guards
 *      keep working unchanged.
 *   2. `provideBffAuthBootstrap()` runs `/me` once before the first route so
 *      a refreshed page with a valid BFF cookie is signed-in by the time
 *      guards activate.
 *   3. The `HTTP_ERROR_CONFIG.onUnauthorized` hook routes 401s through
 *      `BffAuthService.signOut()` instead of `AccountSessionService.clear()`
 *      so the BFF revokes the refresh-token chain too.
 *
 * In mock mode none of this is added — `npm run dev:external` keeps its
 * original mock-only flow.
 */
function bffProviders(): Provider[] {
  if (!environment.useBffAuth) {
    return [
      {
        provide: HTTP_ERROR_CONFIG,
        useFactory: () => {
          const session = inject(AccountSessionService);
          return {
            loginUrl: '/sign-in',
            onUnauthorized: () => session.clear(),
          };
        },
      },
    ];
  }
  return [
    { provide: BFF_SESSION_SINK, useExisting: ExternalBffSessionSink },
    provideBffAuthBootstrap(),
    {
      provide: HTTP_ERROR_CONFIG,
      useFactory: () => {
        const bff = inject(BffAuthService);
        return {
          loginUrl: '/login',
          onUnauthorized: () => {
            void bff.signOut();
          },
        };
      },
    },
  ];
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      routes,
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    provideHttpClient(
      withInterceptors([accountAuthInterceptor, httpErrorInterceptor]),
    ),
    ...bffProviders(),
    ...provideBorderboxMockBootstrap(),
    ...provideCustomerAccountBootstrap(),
    { provide: TitleStrategy, useClass: WayelTitleStrategy },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
