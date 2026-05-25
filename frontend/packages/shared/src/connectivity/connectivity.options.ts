import { InjectionToken } from '@angular/core';

export interface ConnectivityOptions {
  /** When false, only browser online/offline is tracked (no server probe). */
  enabled: boolean;
  /**
   * Lightweight same-origin URL used to verify the BFF/API is reachable.
   * Any HTTP response (including 401) counts as reachable; network errors do not.
   */
  pingUrl: string;
  /** Interval between reachability probes while the browser reports online. */
  pingIntervalMs: number;
}

export const CONNECTIVITY_OPTIONS = new InjectionToken<ConnectivityOptions>(
  'CONNECTIVITY_OPTIONS',
  {
    factory: () => ({
      enabled: true,
      pingUrl: '/bff/auth/me',
      pingIntervalMs: 25_000,
    }),
  },
);
