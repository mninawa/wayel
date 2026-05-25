import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ConnectivityService } from '../services/connectivity.service';

/**
 * Fixed banner shown when the browser is offline or the BFF/API is unreachable.
 * Mount once near the app root (e.g. `App` component).
 */
@Component({
  selector: 'nk-connectivity-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (connectivity.isDisconnected()) {
      <div class="conn-banner" role="alert" aria-live="polite">
        <span class="material-icons-outlined conn-icon" aria-hidden="true">
          {{ connectivity.status() === 'offline' ? 'wifi_off' : 'cloud_off' }}
        </span>
        <div class="conn-text">
          <strong>{{ connectivity.title() }}</strong>
          <span>{{ connectivity.message() }}</span>
        </div>
        @if (connectivity.status() === 'server-unreachable') {
          <button type="button" class="conn-retry" (click)="connectivity.retryNow()">
            Retry
          </button>
        }
      </div>
    }
  `,
  styles: `
    .conn-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.55rem 1rem;
      background: #7f1d1d;
      color: #fff;
      font-size: 0.82rem;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
    .conn-icon { font-size: 1.25rem; flex-shrink: 0; }
    .conn-text {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 0;
    }
    .conn-text strong { font-weight: 600; }
    .conn-retry {
      flex-shrink: 0;
      border: 1px solid rgba(255, 255, 255, 0.65);
      background: transparent;
      color: #fff;
      border-radius: 6px;
      padding: 0.3rem 0.75rem;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
    }
    .conn-retry:hover { background: rgba(255, 255, 255, 0.12); }
  `,
})
export class ConnectivityBannerComponent {
  private readonly platformId = inject(PLATFORM_ID);
  readonly connectivity = inject(ConnectivityService);

  constructor() {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    effect(() => {
      document.body.classList.toggle(
        'nk-connectivity-offline',
        this.connectivity.isDisconnected(),
      );
    });
  }
}
