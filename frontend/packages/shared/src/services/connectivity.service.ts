import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CONNECTIVITY_OPTIONS } from '../connectivity/connectivity.options';

export type ConnectivityStatus = 'online' | 'offline' | 'server-unreachable';

/**
 * Tracks browser network state and (optionally) whether the BFF/API responds.
 * Use {@link ConnectivityBannerComponent} or bind to {@link status} / {@link message}.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly options = inject(CONNECTIVITY_OPTIONS);

  private readonly browserOnline = signal(true);
  private readonly serverReachable = signal(true);
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private probing = false;

  readonly status = computed<ConnectivityStatus>(() => {
    if (!this.browserOnline()) {
      return 'offline';
    }
    if (this.options.enabled && !this.serverReachable()) {
      return 'server-unreachable';
    }
    return 'online';
  });

  readonly isDisconnected = computed(() => this.status() !== 'online');

  readonly message = computed(() => {
    switch (this.status()) {
      case 'offline':
        return 'You appear to be offline. Connect to the internet, then reload this page.';
      case 'server-unreachable':
        return 'We cannot reach the BorderBox server. Check your internet connection, VPN, or Docker stack, then try again.';
      default:
        return '';
    }
  });

  readonly title = computed(() => {
    switch (this.status()) {
      case 'offline':
        return 'No internet connection';
      case 'server-unreachable':
        return 'Server unreachable';
      default:
        return '';
    }
  });

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.browserOnline.set(typeof navigator !== 'undefined' ? navigator.onLine : true);
    this.bindBrowserEvents();
    this.refreshReachability();
    this.startProbeTimer();
  }

  /** Called by {@link httpErrorInterceptor} when an HTTP request fails with status 0. */
  markServerUnreachable(): void {
    if (!this.options.enabled) {
      return;
    }
    this.serverReachable.set(false);
    this.scheduleSoonProbe();
  }

  /** Optimistically mark the server up (e.g. after a successful API call). */
  markServerReachable(): void {
    if (!this.options.enabled) {
      return;
    }
    this.serverReachable.set(true);
  }

  /** Manual retry from the connectivity banner. */
  retryNow(): void {
    void this.probeServer();
  }

  private bindBrowserEvents(): void {
    const onOnline = () => {
      this.browserOnline.set(true);
      this.refreshReachability();
    };
    const onOffline = () => {
      this.browserOnline.set(false);
      this.serverReachable.set(false);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      this.clearProbeTimer();
    });
  }

  private refreshReachability(): void {
    if (!this.browserOnline() || !this.options.enabled) {
      if (!this.options.enabled && this.browserOnline()) {
        this.serverReachable.set(true);
      }
      return;
    }
    void this.probeServer();
  }

  private startProbeTimer(): void {
    if (!this.options.enabled) {
      return;
    }
    this.probeTimer = setInterval(() => {
      if (this.browserOnline()) {
        void this.probeServer();
      }
    }, this.options.pingIntervalMs);
    this.destroyRef.onDestroy(() => this.clearProbeTimer());
  }

  private scheduleSoonProbe(): void {
    if (!this.browserOnline() || !this.options.enabled) {
      return;
    }
    setTimeout(() => void this.probeServer(), 2_000);
  }

  private clearProbeTimer(): void {
    if (this.probeTimer !== null) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
  }

  private async probeServer(): Promise<void> {
    if (!this.options.enabled || !this.browserOnline() || this.probing) {
      return;
    }
    this.probing = true;
    try {
      const url = this.options.pingUrl;
      // Prefer fetch so the probe does not recurse through HTTP interceptors.
      if (typeof fetch !== 'function') {
        this.serverReachable.set(true);
        return;
      }

      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      this.serverReachable.set(true);
      void res.body?.cancel?.();
    } catch {
      this.serverReachable.set(false);
    } finally {
      this.probing = false;
    }
  }
}
