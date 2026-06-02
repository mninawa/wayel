import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Loads GA4 (`gtag.js`) when `environment.googleAnalyticsEnabled` is true and
 * `environment.googleAnalyticsMeasurementId` is set, and sends a page view on
 * each client-side navigation.
 */
@Injectable({ providedIn: 'root' })
export class GoogleAnalyticsService {
  private readonly router = inject(Router);
  private readonly measurementId = environment.googleAnalyticsMeasurementId?.trim() ?? '';
  private enabled = false;

  init(): void {
    if (
      !environment.googleAnalyticsEnabled ||
      !this.measurementId ||
      typeof window === 'undefined'
    ) {
      return;
    }

    this.bootstrapGtag();
    this.enabled = true;
    this.trackPageView(this.router.url);

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.trackPageView(event.urlAfterRedirects));
  }

  trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
    if (!this.enabled || !window.gtag) {
      return;
    }
    window.gtag('event', name, params);
  }

  private trackPageView(url: string): void {
    if (!window.gtag) {
      return;
    }
    window.gtag('config', this.measurementId, { page_path: url });
  }

  private bootstrapGtag(): void {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = (...args: unknown[]) => {
      window.dataLayer!.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', this.measurementId, { send_page_view: false });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(this.measurementId)}`;
    document.head.appendChild(script);
  }
}
