import { InjectionToken } from '@angular/core';
import { environment } from '@app/environment';

/** Base URL for platform tenant HTTP API (no trailing slash). */
export const PLATFORM_API_URL = new InjectionToken<string>('PLATFORM_API_URL', {
  factory: () => environment.platformApiUrl.replace(/\/$/, ''),
});
