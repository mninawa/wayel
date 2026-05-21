/**
 * Environment shape consumed by `@wayel/shared` services.
 *
 * Each app (REMOVED, client-portal) maintains its own concrete
 * `src/environments/environment.ts` and `environment.prod.ts` that satisfies
 * this interface, then exposes it via the `@app/environment` TS path alias.
 *
 * Apps may extend this interface with extra fields specific to their UI;
 * shared code only depends on the keys defined below.
 */
export interface AppEnvironment {
  /** True in `ng serve` / dev builds, false in `ng build --configuration=production`. */
  readonly production: boolean;

  /**
   * When true, all bridge services serve in-memory mock data and do not call
   * `platformApiUrl`. Useful for offline demos and Storybook-style screens.
   */
  readonly useMock: boolean;

  /** Base URL for the platform HTTP API (no trailing slash). */
  readonly platformApiUrl: string;

  /**
   * When true, the platform-tenant bridge talks to the new Wayel.Api
   * admin surface (`/api/v1/admin/tenants/...`) via the BFF cookie
   * session for read + create + rename. When false (or absent), the
   * bridge stays on the legacy Phase-0 contract or in-memory mocks
   * depending on `useMock`. Apps that don't expose tenant management
   * (client-portal, customer-portal) can safely leave this `false`.
   */
  readonly useWayelAdminApi?: boolean;
}
