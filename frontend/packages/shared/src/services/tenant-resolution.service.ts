import { computed, inject, Injectable, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { merge, of } from 'rxjs';
import { distinctUntilChanged, filter, map } from 'rxjs/operators';
import { environment } from '@app/environment';
import type { Phase0PublicTenantBySlugResponse } from '../core/contracts/platform-tenant.phase0';
import { TenantPublicBrandingService } from './tenant-public-branding.service';

/**
 * Resolves institution tenant slug from `?tenant=` or subdomain (e.g. little-stars.localhost),
 * then loads public branding via {@link TenantPublicBrandingService}.
 */
@Injectable({ providedIn: 'root' })
export class TenantResolutionService {
  private readonly router = inject(Router);
  private readonly branding = inject(TenantPublicBrandingService);

  readonly resolvedSlug = signal<string | null>(null);
  readonly publicTenant = signal<Phase0PublicTenantBySlugResponse | null>(null);
  readonly loadError = signal<string | null>(null);

  readonly modeLabel = computed(() => {
    if (environment.useMock) {
      const slug = this.resolvedSlug();
      if (slug) return `Mock · ${slug}`;
      return 'Mock · no API';
    }
    if (!environment.platformApiUrl) return 'API URL not set';
    const slug = this.resolvedSlug();
    if (slug) return `API · ${slug}`;
    return 'Live API';
  });

  constructor() {
    merge(
      of(null),
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)),
    )
      .pipe(
        map(() => this.resolveSlugFromWindow()),
        distinctUntilChanged(),
      )
      .subscribe((slug) => this.loadForSlug(slug));
  }

  private loadForSlug(slug: string | null): void {
    this.resolvedSlug.set(slug);
    this.loadError.set(null);

    if (!slug) {
      this.publicTenant.set(null);
      return;
    }

    this.branding.getBySlug$(slug).subscribe((p) => {
      this.publicTenant.set(p);
      if (!p && !environment.useMock && slug) {
        this.loadError.set('Public tenant not found or API unreachable.');
      } else {
        this.loadError.set(null);
      }
    });
  }

  private resolveSlugFromWindow(): string | null {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    const q = params.get('tenant');
    if (q?.trim()) return q.trim().toLowerCase();

    const host = window.location.hostname;
    const first = host.split('.')[0];
    if (first && first !== 'localhost' && first !== 'www' && first !== 'app') {
      return first.toLowerCase();
    }

    return null;
  }
}
