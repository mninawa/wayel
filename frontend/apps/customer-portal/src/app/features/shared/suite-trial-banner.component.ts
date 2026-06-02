import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { CustomerAccountService } from '../../services/customer-account.service';

@Component({
  selector: 'app-suite-trial-banner',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <div class="trial-banner" [class.trial-banner-urgent]="urgent()" role="status">
        <span class="material-icons-outlined">{{ urgent() ? 'schedule' : 'info' }}</span>
        <div class="trial-copy">
          <strong>{{ heading() }}</strong>
          <p>{{ message() }}</p>
        </div>
        <div class="trial-actions">
          <a routerLink="/suite-access/checkout" [queryParams]="{ plan: 'monthly' }" class="bb-btn bb-btn-outline bb-btn-outline-sm">
            Choose a plan
          </a>
        </div>
      </div>
    }
  `,
  styles: `
    .trial-banner {
      display: flex;
      align-items: flex-start;
      gap: 0.85rem;
      padding: 1rem 1.15rem;
      margin-bottom: 1.25rem;
      background: var(--bb-info-bg, #eff6ff);
      border: 1px solid var(--bb-info-border, #bfdbfe);
      border-radius: var(--bb-radius-sm);
      font-size: 0.85rem;
      color: var(--bb-info-text, #1e40af);
    }
    .trial-banner-urgent {
      background: #fffbeb;
      border-color: #fde68a;
      color: #92400e;
    }
    .trial-banner .material-icons-outlined {
      font-size: 1.35rem;
      flex-shrink: 0;
      margin-top: 0.05rem;
    }
    .trial-copy strong {
      display: block;
      margin-bottom: 0.15rem;
    }
    .trial-copy p {
      margin: 0;
      font-size: 0.82rem;
      line-height: 1.45;
      opacity: 0.95;
    }
    .trial-actions {
      margin-left: auto;
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
      align-items: center;
    }
    @media (max-width: 720px) {
      .trial-banner {
        flex-wrap: wrap;
      }
      .trial-actions {
        margin-left: 0;
        width: 100%;
      }
      .trial-actions .bb-btn {
        width: 100%;
        justify-content: center;
      }
    }
  `,
})
export class SuiteTrialBannerComponent {
  private readonly accountApi = inject(CustomerAccountService);
  private readonly router = inject(Router);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly show = computed(() => {
    const trial = this.accountApi.account()?.suiteTrial;
    if (!trial?.isActive || !trial.expiresAtUtc) {
      return false;
    }
    const url = this.currentUrl() ?? '';
    if (url.startsWith('/suite-access/checkout')) {
      return false;
    }
    return true;
  });

  readonly expiresAt = computed(() => {
    const raw = this.accountApi.account()?.suiteTrial?.expiresAtUtc;
    if (!raw) {
      return null;
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });

  readonly daysLeft = computed(() => {
    const end = this.expiresAt();
    if (!end) {
      return null;
    }
    const ms = end.getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  });

  readonly urgent = computed(() => {
    const days = this.daysLeft();
    return days !== null && days <= 7;
  });

  readonly heading = computed(() => {
    const days = this.daysLeft();
    if (days === null) {
      return 'Early adopter — first 30 days free';
    }
    if (days === 0) {
      return 'Early adopter offer ends today';
    }
    if (days === 1) {
      return 'Early adopter offer ends tomorrow';
    }
    if (this.urgent()) {
      return `Early adopter — ${days} days left on your free 30 days`;
    }
    return 'Early adopter — first 30 days free';
  });

  readonly message = computed(() => {
    const end = this.expiresAt();
    if (!end) {
      return 'As an early adopter, your first 30 days are on us. Subscribe before the offer ends to keep ship-out unlocked — your suite number stays reserved either way.';
    }
    const formatted = end.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    if (this.urgent()) {
      return `Your complimentary access ends on ${formatted}. Subscribe before then to keep shipping out — you can still receive parcels and upload invoices after that.`;
    }
    return `Your first 30 days are free until ${formatted}. Full suite access today, no payment required yet. Subscribe anytime before then to avoid interruption.`;
  });
}
