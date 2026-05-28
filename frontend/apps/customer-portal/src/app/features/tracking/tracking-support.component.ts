import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import type { TrackingSupportOverviewDto } from '../../services/borderbox-api.service';
import { BorderboxApiService } from '../../services/borderbox-api.service';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-tracking-support',
  standalone: true,
  imports: [RouterLink, DatePipe, SuiteExpiredBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bb-page-head">
      <h1>Support</h1>
      <p>Reach our team on WhatsApp or email — we will respond as fast as we can.</p>
    </div>

    <app-suite-expired-banner />

    @if (loading()) {
      <p class="loading" aria-live="polite">Loading support…</p>
    } @else if (loadError()) {
      <div class="bb-card bb-card-pad err-card">
        <p class="err">{{ loadError() }}</p>
        <button type="button" class="bb-btn bb-btn-outline" (click)="reload()">Try again</button>
      </div>
    } @else if (overview()) {
      @let o = overview()!;
      <div class="support-layout">
        <section class="bb-card bb-card-pad channels-card">
          <h2 class="bb-card-title">Talk to us</h2>
          <p class="card-lead">Pick the channel that works best for you.</p>
          <div class="channels">
            @if (whatsAppLink(); as link) {
              <a
                [href]="link"
                target="_blank"
                rel="noopener noreferrer"
                class="channel channel-whatsapp"
              >
                <span class="channel-icon" aria-hidden="true">
                  <span class="material-icons-outlined">chat</span>
                </span>
                <span class="channel-body">
                  <strong>WhatsApp</strong>
                  <small>{{ whatsAppDisplay() ?? 'Chat with our team' }}</small>
                </span>
                <span class="material-icons-outlined channel-go" aria-hidden="true">arrow_forward</span>
              </a>
            } @else {
              <div class="channel channel-disabled" aria-disabled="true">
                <span class="channel-icon" aria-hidden="true">
                  <span class="material-icons-outlined">chat</span>
                </span>
                <span class="channel-body">
                  <strong>WhatsApp</strong>
                  <small>Not available yet — please use email below.</small>
                </span>
              </div>
            }

            @if (emailLink(); as mailto) {
              <a [href]="mailto" class="channel channel-email">
                <span class="channel-icon" aria-hidden="true">
                  <span class="material-icons-outlined">mail</span>
                </span>
                <span class="channel-body">
                  <strong>Email</strong>
                  <small>{{ o.support.emailAddress }}</small>
                </span>
                <span class="material-icons-outlined channel-go" aria-hidden="true">arrow_forward</span>
              </a>
            }
          </div>
        </section>

        @if (o.activeShipmentId; as shipId) {
          <section class="bb-card bb-card-pad active-shipment-link">
            <h2 class="bb-card-title">Tracking your shipment?</h2>
            <p class="card-lead">
              Step-by-step status, ETA and pickup details are on your shipment page.
            </p>
            <a
              [routerLink]="['/shipments', shipId, 'track']"
              class="bb-btn bb-btn-outline track-btn"
            >
              Open shipment tracking
            </a>
          </section>
        }
      </div>
    }
  `,
  styles: `
    .loading { color: var(--bb-muted); font-size: 0.9rem; padding: 1rem 0; }
    .err-card { max-width: 28rem; }
    .support-layout {
      display: flex;
      flex-direction: column;
      gap: 1.15rem;
      max-width: 36rem;
    }
    .card-lead {
      margin: 0 0 0.85rem;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }
    .channels { display: flex; flex-direction: column; gap: 0.65rem; }
    .channel {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      padding: 0.85rem 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      background: #fff;
      text-decoration: none;
      color: inherit;
      transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
    }
    .channel:hover:not(.channel-disabled) {
      border-color: var(--bb-link);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
      transform: translateY(-1px);
    }
    .channel-icon {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .channel-whatsapp .channel-icon {
      background: rgba(37, 211, 102, 0.12);
      color: #128c7e;
    }
    .channel-email .channel-icon {
      background: var(--bb-surface-muted);
      color: var(--bb-ink);
    }
    .channel-disabled .channel-icon {
      background: #f1f5f9;
      color: #94a3b8;
    }
    .channel-icon .material-icons-outlined { font-size: 1.4rem !important; }
    .channel-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .channel-body strong { font-size: 0.95rem; }
    .channel-body small { font-size: 0.82rem; color: var(--bb-muted); margin-top: 0.2rem; line-height: 1.4; }
    .channel-go {
      color: var(--bb-muted);
      font-size: 1.1rem !important;
      flex-shrink: 0;
    }
    .channel-disabled {
      background: #f8fafc;
      cursor: default;
    }
    .track-btn { width: 100%; justify-content: center; }
    .err { color: var(--bb-danger); font-size: 0.85rem; }
  `,
})
export class TrackingSupportComponent implements OnInit {
  private readonly api = inject(BorderboxApiService);

  readonly overview = signal<TrackingSupportOverviewDto | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly whatsAppLink = computed(() => {
    const fromApi = this.overview()?.support.whatsAppLink?.trim();
    if (fromApi) {
      return fromApi;
    }

    return buildWhatsAppLink(environment.supportWhatsAppE164);
  });

  readonly whatsAppDisplay = computed(() => {
    const fromApi = this.overview()?.support.whatsAppDisplay?.trim();
    if (fromApi) {
      return fromApi;
    }

    const link = buildWhatsAppLink(environment.supportWhatsAppE164);
    if (!link) {
      return null;
    }

    const digits = environment.supportWhatsAppE164?.replace(/\D/g, '') ?? '';
    return digits.length >= 10 ? `+${digits}` : 'Chat with our team';
  });

  readonly emailLink = computed(() => {
    const email = this.overview()?.support.emailAddress?.trim()
      ?? environment.supportEmail?.trim();
    if (!email) {
      return null;
    }

    return `mailto:${email}?subject=${encodeURIComponent('WeYell support')}`;
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.api.getTrackingSupport().subscribe({
      next: (o) => {
        this.overview.set(o);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load support. Check your connection and try again.');
      },
    });
  }
}

function buildWhatsAppLink(rawE164: string | undefined | null): string | null {
  const digits = (rawE164 ?? '').replace(/\D/g, '');
  if (digits.length < 8) {
    return null;
  }

  return `https://wa.me/${digits}`;
}
