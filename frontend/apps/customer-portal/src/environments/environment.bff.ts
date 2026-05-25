/**
 * Active when `ng serve --configuration bff` is used (development against
 * `REMOVED`). Same shape as `environment.ts` so consumers keep
 * narrow typing — see `angular.json` `build.configurations.bff` for the
 * file replacement that swaps this in.
 *
 * Differences from the default dev environment:
 *   - `useMock: false`   — real HTTP calls go through the BFF proxy.
 *   - `useBffAuth: true` — `app.config.ts` registers
 *                          `provideBffAuthBootstrap()` and the login
 *                          screen routes "Continue with Google" through
 *                          `BffAuthService.signInWithGoogle()`.
 */
export const environment = {
  production: false,
  useMock: false,
  useBffAuth: true,
  platformApiUrl: '',
  /**
   * Customer portal is Google-SSO-only. The API still accepts
   * email/password (Auth:EnablePasswordSignIn=true in docker-compose) for
   * integration tests and demo personas, but the SPA hides the form so
   * customers see a single clear path to authenticate.
   */
  passwordSignInEnabled: false,
  enableKycOpsReview: true,
  enableParcelReceive: true,
};
