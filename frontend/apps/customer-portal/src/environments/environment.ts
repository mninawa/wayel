export const environment = {
  production: false,
  /**
   * Legacy flag retained for `@wayel/shared` bridge services (cross-product
   * workspace). The customer portal does not consume mock data — every
   * service call goes through the live API.
   */
  useMock: false,
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
  /** Internal KYC ops queue at /internal/kyc-review (localhost only). */
  enableKycOpsReview: true,
  /** Warehouse parcel receive at /internal/parcel-receive */
  enableParcelReceive: true,
  /** Google Maps Embed / JS API key for pickup location maps. */
  googleMapsApiKey: 'AIzaSyCjkC0e4WQGbrefPDfkX0hoPfZR3DUAc4c',
  /** Fallback when API BorderBox:SupportWhatsAppE164 is unset (digits only, no +). */
  supportWhatsAppE164: '',
  /** Fallback when API BorderBox:SupportEmail is unset. */
  supportEmail: '',
};
