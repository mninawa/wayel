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
   * Default `true` so the BFF-mode dev loop keeps the password form
   * available (the API in Development auto-enables password sign-in).
   * Flip to `false` to test the SSO-only posture locally against a
   * Production-mode API.
   */
  passwordSignInEnabled: true,
};
