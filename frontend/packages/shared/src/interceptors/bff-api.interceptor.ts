import { HttpInterceptorFn } from '@angular/common/http';

function readXsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('XSRF-TOKEN='));
  if (!match) return null;
  return decodeURIComponent(match.slice('XSRF-TOKEN='.length));
}

function isBffApiRequest(url: string): boolean {
  return url.includes('/api/') || url.includes('/bff/');
}

/**
 * Ensures cookie-based BFF sessions work for `/api` and `/bff` calls:
 * - `withCredentials` so the auth cookie is sent
 * - `X-XSRF-TOKEN` for state-changing requests (PATCH notifications, etc.)
 */
export const bffApiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isBffApiRequest(req.url)) {
    return next(req);
  }

  const headers: Record<string, string> = {};
  const xsrf = readXsrfCookie();
  if (xsrf && req.method !== 'GET' && req.method !== 'HEAD') {
    headers['X-XSRF-TOKEN'] = xsrf;
  }

  return next(
    req.clone({
      withCredentials: true,
      setHeaders: headers,
    }),
  );
};
