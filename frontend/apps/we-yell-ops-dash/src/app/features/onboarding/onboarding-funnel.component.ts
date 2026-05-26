import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { OpsSessionService } from '../../services/ops-session.service';
import {
  OnboardingOpsApiService,
  type PayLaterIntentRow,
  type PayLaterIntentsPage,
  type PayLaterStatsDto,
  type PayLaterStatusFilter,
} from '../../services/onboarding-ops-api.service';

/**
 * Ops view onto the onboarding "Pay later" cohort.
 *
 * <p>Top strip: aggregate KPIs (pending, resolved, conversion rate, avg time
 * to pay, stale pending). Bottom: paged list of customers filtered by status.</p>
 *
 * <p>The data lives in the <code>pay_later_intents</code> Mongo collection,
 * populated whenever a customer clicks "Pay later — explore first" on the
 * onboarding plan picker. Rows are resolved automatically by the suite
 * checkout completion handler.</p>
 */
@Component({
  selector: 'ops-onboarding-funnel',
  standalone: true,
  imports: [DatePipe],
  providers: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Onboarding funnel</h1>
          <p class="sub">Customers who deferred suite payment during onboarding.</p>
        </div>
        <button type="button" class="btn ghost" (click)="refresh()" [disabled]="busy()">
          <span class="material-icons-outlined">refresh</span> Refresh
        </button>
      </header>

      @if (error()) {
        <div class="banner err" role="alert">{{ error() }}</div>
      }

      <section class="kpis" aria-label="Pay-later KPIs">
        @for (k of kpiCards(); track k.label) {
          <article class="kpi" [attr.data-tone]="k.tone">
            <span class="material-icons-outlined kpi-icon">{{ k.icon }}</span>
            <div>
              <span class="kpi-label">{{ k.label }}</span>
              <strong class="kpi-value">{{ k.value }}</strong>
              @if (k.hint) {
                <span class="kpi-hint">{{ k.hint }}</span>
              }
            </div>
          </article>
        }
      </section>

      <section class="table-card">
        <div class="table-head">
          <div class="tabs" role="tablist" aria-label="Filter by status">
            @for (t of tabs; track t.id) {
              <button
                type="button"
                role="tab"
                [attr.aria-selected]="t.id === activeStatus()"
                class="tab"
                [class.active]="t.id === activeStatus()"
                (click)="setStatus(t.id)"
              >
                {{ t.label }}
                @if (tabCount(t.id); as count) {
                  <span class="tab-count">{{ count }}</span>
                }
              </button>
            }
          </div>
        </div>

        @if (busy()) {
          <div class="row-info">Loading…</div>
        } @else if (rows().length === 0) {
          <div class="row-info muted">No customers in this bucket yet.</div>
        } @else {
          <table class="rows">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Destination</th>
                <th>Plan picked</th>
                <th>Deferred at</th>
                <th>Days waiting</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.userId) {
                <tr>
                  <td>
                    <div class="customer">
                      <strong>{{ row.displayName || row.email }}</strong>
                      <span class="muted">{{ row.email }}</span>
                      @if (row.phone) {
                        <span class="muted">{{ row.phone }}</span>
                      }
                    </div>
                  </td>
                  <td>{{ row.destinationCountryCode }}</td>
                  <td>{{ row.planAtSignalLabel || '—' }}</td>
                  <td>{{ row.createdAtUtc | date: 'mediumDate' }}</td>
                  <td>
                    <span class="days" [class.warn]="row.status === 'pending' && row.daysWaiting > 14">
                      {{ row.daysWaiting }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" [class.pending]="row.status === 'pending'" [class.resolved]="row.status === 'resolved'">
                      {{ row.status }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }

        @if (page() && totalPages() > 1) {
          <div class="pager">
            <button type="button" class="btn ghost" (click)="prev()" [disabled]="page() <= 1 || busy()">‹ Prev</button>
            <span class="muted">Page {{ page() }} of {{ totalPages() }}</span>
            <button type="button" class="btn ghost" (click)="next()" [disabled]="page() >= totalPages() || busy()">Next ›</button>
          </div>
        }
      </section>
    </div>
  `,
  styles: `
    .page { padding: 1.5rem 2rem; max-width: 1280px; }
    .page-head { display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 1.25rem; gap: 1rem; flex-wrap: wrap; }
    .page-head h1 { margin: 0; font-size: 1.5rem; font-weight: 700; }
    .sub { color: var(--ops-text-muted); margin: 0.3rem 0 0; }
    .banner { padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 1rem; font-size: 0.88rem; }
    .banner.err { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; }

    .kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.85rem;
      margin-bottom: 1.5rem;
    }
    .kpi {
      background: #fff;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius);
      padding: 0.95rem 1rem;
      display: flex;
      gap: 0.85rem;
      align-items: flex-start;
    }
    .kpi-icon {
      flex-shrink: 0;
      background: var(--ops-brand-purple-soft, #ede9fe);
      color: var(--ops-brand-purple, #7c3aed);
      border-radius: 8px;
      padding: 0.45rem;
      font-size: 1.15rem !important;
    }
    .kpi[data-tone="amber"] .kpi-icon { background: #fef3c7; color: #b45309; }
    .kpi[data-tone="green"] .kpi-icon { background: #dcfce7; color: #15803d; }
    .kpi[data-tone="red"]   .kpi-icon { background: #fee2e2; color: #b91c1c; }
    .kpi-label { display: block; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ops-text-muted); font-weight: 600; }
    .kpi-value { display: block; font-size: 1.6rem; font-weight: 700; margin: 0.2rem 0; line-height: 1.05; }
    .kpi-hint { display: block; font-size: 0.74rem; color: var(--ops-text-muted); }

    .table-card { background: #fff; border: 1px solid var(--ops-border); border-radius: var(--ops-radius); overflow: hidden; }
    .table-head { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--ops-border); }
    .tabs { display: flex; gap: 0.35rem; }
    .tab {
      background: transparent;
      border: 1px solid transparent;
      padding: 0.4rem 0.85rem;
      font-size: 0.83rem;
      font-weight: 600;
      color: var(--ops-text-muted);
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      cursor: pointer;
    }
    .tab:hover { color: var(--ops-text); }
    .tab.active { background: var(--ops-brand-purple-soft, #ede9fe); color: var(--ops-brand-purple, #7c3aed); border-color: transparent; }
    .tab-count { background: rgba(0,0,0,0.06); padding: 0.05rem 0.45rem; border-radius: 999px; font-size: 0.72rem; }
    .tab.active .tab-count { background: rgba(124,58,237,0.18); color: inherit; }

    .row-info { padding: 1.5rem; text-align: center; color: var(--ops-text-muted); }
    .row-info.muted { color: var(--ops-text-muted); }

    table.rows { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    table.rows th, table.rows td { padding: 0.65rem 0.85rem; text-align: left; vertical-align: top; }
    table.rows th { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ops-text-muted); border-bottom: 1px solid var(--ops-border); background: #fafafa; }
    table.rows tbody tr + tr td { border-top: 1px solid var(--ops-border); }
    .customer { display: flex; flex-direction: column; gap: 0.15rem; }
    .customer strong { font-weight: 700; }
    .muted { color: var(--ops-text-muted); font-size: 0.78rem; }

    .badge { display: inline-block; padding: 0.18rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .badge.pending  { background: #fef3c7; color: #b45309; }
    .badge.resolved { background: #dcfce7; color: #15803d; }

    .days { display: inline-block; padding: 0.18rem 0.5rem; border-radius: 999px; font-size: 0.78rem; font-weight: 700; background: #f1f5f9; color: var(--ops-text); }
    .days.warn { background: #fee2e2; color: #b91c1c; }

    .pager { display: flex; align-items: center; gap: 0.85rem; padding: 0.85rem; justify-content: center; border-top: 1px solid var(--ops-border); }
    .btn { padding: 0.45rem 0.85rem; border-radius: var(--ops-radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; }
    .btn.ghost { background: #fff; border: 1px solid var(--ops-border); color: var(--ops-text); display: inline-flex; align-items: center; gap: 0.35rem; }
    .btn.ghost:hover:not([disabled]) { border-color: var(--ops-brand-purple, #7c3aed); color: var(--ops-brand-purple, #7c3aed); }
    .btn[disabled] { opacity: 0.55; cursor: not-allowed; }
  `,
})
export class OnboardingFunnelComponent implements OnInit {
  private readonly api = inject(OnboardingOpsApiService);
  private readonly session = inject(OpsSessionService);
  private readonly decimal = inject(DecimalPipe);

  readonly tabs: ReadonlyArray<{ id: PayLaterStatusFilter; label: string }> = [
    { id: 'pending', label: 'Pending' },
    { id: 'resolved', label: 'Resolved' },
    { id: 'all', label: 'All time' },
  ];

  readonly activeStatus = signal<PayLaterStatusFilter>('pending');
  readonly page = signal(1);
  readonly pageSize = signal(20);

  readonly stats = signal<PayLaterStatsDto | null>(null);
  readonly listPage = signal<PayLaterIntentsPage | null>(null);
  readonly rows = computed<PayLaterIntentRow[]>(() => this.listPage()?.items ?? []);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly totalPages = computed(() => {
    const lp = this.listPage();
    if (!lp || lp.pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(lp.total / lp.pageSize));
  });

  readonly kpiCards = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const conversion = s.totalEver > 0
      ? (s.resolvedTotal / s.totalEver) * 100
      : null;
    return [
      {
        label: 'Pending now',
        value: this.decimal.transform(s.currentlyPending, '1.0-0') ?? String(s.currentlyPending),
        icon: 'pending_actions',
        tone: s.currentlyPending > 0 ? 'amber' : 'green',
        hint: s.stalePending > 0
          ? `${s.stalePending} idle > 14d`
          : null,
      },
      {
        label: 'Resolved (paid)',
        value: this.decimal.transform(s.resolvedTotal, '1.0-0') ?? String(s.resolvedTotal),
        icon: 'task_alt',
        tone: 'green',
        hint: s.resolvedLast7Days > 0
          ? `+${s.resolvedLast7Days} last 7 days`
          : 'No conversions this week',
      },
      {
        label: 'Conversion rate',
        value: conversion === null ? '—' : `${conversion.toFixed(0)}%`,
        icon: 'trending_up',
        tone: conversion === null || conversion >= 50 ? 'green' : 'amber',
        hint: s.totalEver > 0 ? `of ${s.totalEver} total ever` : 'No deferrals yet',
      },
      {
        label: 'Avg time to pay',
        value: s.averageHoursToResolve === null
          ? '—'
          : this.formatHours(s.averageHoursToResolve),
        icon: 'schedule',
        tone: 'green',
        hint: s.averageHoursToResolve === null ? null : 'create → paid',
      },
      {
        label: 'New this week',
        value: this.decimal.transform(s.newLast7Days, '1.0-0') ?? String(s.newLast7Days),
        icon: 'event_available',
        tone: 'green',
        hint: 'Customers who chose pay-later',
      },
    ] as const;
  });

  ngOnInit(): void {
    this.refresh();
  }

  /**
   * Returns the badge count for a status tab, or <code>null</code> if there
   * isn't a meaningful number to show (e.g. stats haven't loaded, or the
   * tab is "All time" which would be redundant with the total row count).
   */
  tabCount(id: PayLaterStatusFilter): number | null {
    const s = this.stats();
    if (!s) return null;
    if (id === 'pending') return s.currentlyPending;
    if (id === 'resolved') return s.resolvedTotal;
    return null;
  }

  setStatus(status: PayLaterStatusFilter): void {
    if (this.activeStatus() === status) return;
    this.activeStatus.set(status);
    this.page.set(1);
    this.loadList();
  }

  prev(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.loadList();
  }

  next(): void {
    if (this.page() >= this.totalPages()) return;
    this.page.update((p) => p + 1);
    this.loadList();
  }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) {
      this.error.set('Sign in to load onboarding metrics.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    let pending = 2;
    const done = () => {
      pending -= 1;
      if (pending === 0) this.busy.set(false);
    };
    this.api.getPayLaterStats(key).subscribe({
      next: (s) => {
        this.stats.set(s);
        done();
      },
      error: () => {
        this.error.set('Could not load funnel KPIs.');
        done();
      },
    });
    this.api
      .listPayLater(key, this.activeStatus(), this.page(), this.pageSize())
      .subscribe({
        next: (p) => {
          this.listPage.set(p);
          done();
        },
        error: () => {
          // Keep the more specific KPI error if there is one, otherwise show
          // the list failure — we don't want to clobber a "stats failed"
          // banner with a different message.
          this.error.update((prev) => prev ?? 'Could not load pay-later customers.');
          done();
        },
      });
  }

  /** Reload only the table — used when the user changes filters or pages. */
  private loadList(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.api
      .listPayLater(key, this.activeStatus(), this.page(), this.pageSize())
      .subscribe({
        next: (p) => {
          this.listPage.set(p);
          this.busy.set(false);
        },
        error: () => {
          this.busy.set(false);
          this.error.set('Could not load pay-later customers.');
        },
      });
  }

  private formatHours(hours: number): string {
    if (hours < 1) {
      const minutes = Math.max(1, Math.round(hours * 60));
      return `${minutes}m`;
    }
    if (hours < 24) {
      return `${hours.toFixed(1)}h`;
    }
    const days = hours / 24;
    return `${days.toFixed(1)}d`;
  }
}
