export const environment = {
  production: false,
  /**
   * UI-only mode: all WeYell data and auth are in-memory. No API, BFF, or
   * platform-mock-api process required. Run `npm run dev:portal` only.
   */
  useMock: true,
  /**
   * When true, the SPA bootstraps a `BffAuthService` session against
   * `REMOVED` (cookie + Google SSO) instead of running open
   * mock email/password. Default `false` keeps `npm run dev:external`
   * (mock-only) unchanged; the `bff` serve configuration swaps in
   * `environment.bff.ts` which sets this to `true`.
   */
  useBffAuth: false,
  /**
   * Base URL for the platform/external API (no trailing slash).
   * With `ng serve` + `proxy.conf.json`, leave as '' so requests stay
   * same-origin and `/api/*` is proxied to the mock server on :5280.
   * For direct calls (no proxy), set e.g. `http://localhost:5280`.
   */
  platformApiUrl: '',
  /**
   * Build-time switch that mirrors the API's `Auth:EnablePasswordSignIn`
   * flag. Dev defaults to `true` so the seeded `@*.test` users keep
   * working through the password form. Production sets this to `false`
   * (see `environment.prod.ts`) so only the Google / SSO buttons
   * render — matches the API which returns 403
   * `auth.password_login_disabled` from `/auth/login` outside Development.
   */
  passwordSignInEnabled: true,
};
