import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import { PlatformSessionService } from '../services/platform-session.service';

function apiPathFromRequestUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      return new URL(url).pathname;
    } catch {
      return '';
    }
  }
  const q = url.indexOf('?');
  return q >= 0 ? url.slice(0, q) : url;
}

function isPlatformApiRequest(url: string, base: string): boolean {
  if (base && url.startsWith(base)) return true;
  // Legacy Phase-0 paths used `/api/platform/...`; Wayel.Api lives under `/api/v1/...`.
  if (url.includes('/api/platform/')) return true;
  return apiPathFromRequestUrl(url).startsWith('/api/');
}

/** Attaches `Authorization: Bearer` for platform API requests when a token is stored. */
export const platformAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(PlatformSessionService);
  const base = inject(PLATFORM_API_URL);
  const token = session.getAccessToken();
  if (!token || !isPlatformApiRequest(req.url, base)) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
