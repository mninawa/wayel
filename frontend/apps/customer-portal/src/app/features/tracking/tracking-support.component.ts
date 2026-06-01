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
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-tracking-support',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="support-shell">
      <div class="bb-page-head">
        <h1>Support</h1>
        <p>Reach our team on WhatsApp or email — we will respond as fast as we can.</p>
      </div>

      <app-suite-expired-banner />

      @if (loading()) {
        <nk-pulse-loader label="Loading support…" />
      } @else if (loadError()) {
        <div class="bb-card bb-card-pad err-card">
          <p class="err">{{ loadError() }}</p>
          <button type="button" class="bb-btn bb-btn-outline" (click)="reload()">Try again</button>
        </div>
      } @else if (overview()) {
        <p class="section-lead">Pick the channel that works best for you.</p>

        <div class="contact-grid">
          @if (whatsAppLink(); as link) {
            <a
              [href]="link"
              target="_blank"
              rel="noopener noreferrer"
              class="contact-tile contact-tile-whatsapp bb-card"
            >
              <div class="tile-top">
                <span class="tile-icon" aria-hidden="true">
                  <span class="material-icons-outlined">chat</span>
                </span>
                <span class="material-icons-outlined tile-arrow" aria-hidden="true">north_east</span>
              </div>
              <span class="tile-title">WhatsApp</span>
              <span class="tile-sub">{{ whatsAppDisplay() ?? 'Chat with our team' }}</span>
            </a>
          } @else {
            <div class="contact-tile contact-tile-disabled bb-card" aria-disabled="true">
              <div class="tile-top">
                <span class="tile-icon" aria-hidden="true">
                  <span class="material-icons-outlined">chat</span>
                </span>
              </div>
              <span class="tile-title">WhatsApp</span>
              <span class="tile-sub">Not available yet — please use email.</span>
            </div>
          }

          @if (emailLink(); as mailto) {
            <a [href]="mailto" class="contact-tile contact-tile-email bb-card">
              <div class="tile-top">
                <span class="tile-icon" aria-hidden="true">
                  <span class="material-icons-outlined">mail</span>
                </span>
                <span class="material-icons-outlined tile-arrow" aria-hidden="true">north_east</span>
              </div>
              <span class="tile-title">Email</span>
              <span class="tile-sub">{{ emailAddress() }}</span>
            </a>
          }
        </div>

        @if (overview()!.activeShipmentId; as shipId) {
          <section class="bb-card bb-card-pad shipment-card">
            <h2 class="bb-card-title">Tracking your shipment?</h2>
            <p class="shipment-lead">
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
      }
    </div>
  `,
  styles: `
    .support-shell {
      width: 100%;
      max-width: 52rem;
    }

    .section-lead {
      margin: 0 0 1rem;
      font-size: 0.9rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }

    .contact-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }

    @media (max-width: 640px) {
      .contact-grid {
        grid-template-columns: 1fr;
      }
    }

    .contact-tile {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-height: 9.5rem;
      padding: 1.35rem 1.4rem;
      text-decoration: none;
      color: inherit;
      transition: box-shadow 140ms ease, transform 140ms ease;
    }

    .contact-tile:not(.contact-tile-disabled):hover {
      box-shadow: var(--bb-shadow-md);
      transform: translateY(-2px);
    }

    .contact-tile:not(.contact-tile-disabled):focus-visible {
      outline: 2px solid var(--bb-ink);
      outline-offset: 3px;
    }

    .tile-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 0.35rem;
    }

    .tile-icon {
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .contact-tile-whatsapp .tile-icon {
      background: rgba(37, 211, 102, 0.14);
      color: #128c7e;
    }

    .contact-tile-email .tile-icon {
      background: var(--bb-surface-muted);
      color: var(--bb-ink);
    }

    .contact-tile-disabled .tile-icon {
      background: #f1f5f9;
      color: #94a3b8;
    }

    .tile-icon .material-icons-outlined {
      font-size: 1.45rem !important;
    }

    .tile-arrow {
      color: var(--bb-subtle);
      font-size: 1.15rem !important;
      transition: color 140ms ease, transform 140ms ease;
    }

    .contact-tile:not(.contact-tile-disabled):hover .tile-arrow {
      color: var(--bb-ink);
      transform: translate(2px, -2px);
    }

    .tile-title {
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--bb-text);
    }

    .tile-sub {
      font-size: 0.84rem;
      color: var(--bb-muted);
      line-height: 1.45;
      word-break: break-word;
    }

    .contact-tile-disabled {
      background: #fafbfc;
      cursor: default;
      opacity: 0.92;
    }

    .shipment-card {
      margin-top: 0.25rem;
    }

    .shipment-card .bb-card-title {
      margin-bottom: 0.5rem;
    }

    .shipment-lead {
      margin: 0 0 1rem;
      font-size: 0.84rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }

    .track-btn {
      width: 100%;
      justify-content: center;
    }

    .err-card {
      max-width: 28rem;
    }

    .err {
      color: var(--bb-danger);
      font-size: 0.85rem;
      margin: 0 0 0.85rem;
    }
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

    const fromEnvLink = environment.supportWhatsAppLink?.trim();
    if (fromEnvLink) {
      return fromEnvLink;
    }

    return buildWhatsAppLink(environment.supportWhatsAppE164);
  });

  readonly whatsAppDisplay = computed(() => {
    const link = this.whatsAppLink();
    const fromApi = this.overview()?.support.whatsAppDisplay?.trim();

    if (link?.includes('/message/')) {
      if (fromApi && !looksLikePhone(fromApi)) {
        return fromApi;
      }

      const envLabel = environment.supportWhatsAppLabel?.trim();
      return envLabel || 'Chat with our team';
    }

    if (fromApi) {
      return fromApi;
    }

    const envLabel = environment.supportWhatsAppLabel?.trim();
    if (environment.supportWhatsAppLink?.trim()) {
      return envLabel || 'Chat with our team';
    }

    const phoneLink = buildWhatsAppLink(environment.supportWhatsAppE164);
    if (!phoneLink) {
      return null;
    }

    const digits = environment.supportWhatsAppE164?.replace(/\D/g, '') ?? '';
    return digits.length >= 10 ? `+${digits}` : 'Chat with our team';
  });

  readonly emailAddress = computed(() => {
    const fromApi = this.overview()?.support.emailAddress?.trim();
    if (fromApi) {
      return fromApi;
    }

    return environment.supportEmail?.trim() ?? null;
  });

  readonly emailLink = computed(() => {
    const email = this.emailAddress();
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

function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && /^\+?\d[\d\s-]+$/.test(value.trim());
}
