import { APP_INITIALIZER, Provider, inject } from '@angular/core';
import { GoogleAnalyticsService } from '../services/google-analytics.service';

export function provideGoogleAnalytics(): Provider {
  return {
    provide: APP_INITIALIZER,
    multi: true,
    useFactory: () => {
      const analytics = inject(GoogleAnalyticsService);
      return () => analytics.init();
    },
  };
}
