import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CustomerAccountService } from '../../services/customer-account.service';
import { ParcelsService } from '../../services/parcels.service';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bb-page-head bb-hide-md-down">
      <h1>Dashboard</h1>
      <p>Parcels, suite access, and your South Africa delivery address.</p>
    </div>

    <app-suite-expired-banner />

    @if (heroCard(); as hero) {
      <section class="hero bb-card-dark bb-card-pad">
        <div class="hero-top">
          <span class="bb-badge" [class.bb-badge-success]="!suiteAccess().shipOutLocked" [class.bb-badge-info]="suiteAccess().shipOutLocked">
            {{ hero.statusLabel }}
          </span>
          <a routerLink="/my-address" class="hero-link">View address →</a>
        </div>
        <h2 class="hero-route">{{ hero.route }}</h2>
        <p class="hero-id">Suite {{ hero.suiteNumber ?? '—' }}</p>
        <div class="bb-progress" aria-hidden="true">
          <span [style.width.%]="hero.progress"></span>
        </div>
        <p class="hero-meta">{{ hero.meta }}</p>
        <div class="hero-actions">
          <a routerLink="/received-parcels" class="hero-action" title="Parcels">
            <span class="material-icons-outlined">inventory_2</span>
            <span>Parcels</span>
          </a>
          <a routerLink="/my-address" class="hero-action" title="Address">
            <span class="material-icons-outlined">location_on</span>
            <span>Address</span>
          </a>
          <a routerLink="/quotes/list" class="hero-action" title="Quotes">
            <span class="material-icons-outlined">request_quote</span>
            <span>Quotes</span>
          </a>
          <a routerLink="/tracking-support" class="hero-action" title="Support">
            <span class="material-icons-outlined">support_agent</span>
            <span>Support</span>
          </a>
        </div>
      </section>
    }

    <section class="stats">
      @for (s of statCards(); track s.title) {
        <article class="stat bb-card">
          <div class="stat-icon" [attr.data-color]="s.color">
            <span class="material-icons-outlined">{{ s.icon }}</span>
          </div>
          <div>
            <p class="stat-val">{{ s.value }}</p>
            <p class="stat-lbl">{{ s.label }}</p>
          </div>
          <a [routerLink]="s.link" class="stat-link">{{ s.cta }} →</a>
        </article>
      }
    </section>

    <div class="grid-3">
      <section class="bb-card bb-card-pad suite-card">
        <div class="card-head">
          <h2 class="bb-card-title">Suite Access</h2>
          <span class="bb-badge" [class.bb-badge-danger]="suiteAccess().shipOutLocked" [class.bb-badge-success]="!suiteAccess().shipOutLocked">{{ suiteAccess().status }}</span>
        </div>
        <dl class="kv">
          <div><dt>Status</dt><dd [class.danger]="suiteAccess().shipOutLocked">{{ suiteAccess().status }}</dd></div>
          <div><dt>Suite Number</dt><dd>{{ suiteAccess().suiteNumber ?? '—' }}</dd></div>
          @if (suiteLastDay()) {
            <div><dt>Valid until</dt><dd>{{ suiteLastDay() }}</dd></div>
          }
          <div><dt>Ship-out</dt>
            <dd [class.danger]="suiteAccess().shipOutLocked">
              @if (suiteAccess().shipOutLocked) {
                <span class="material-icons-outlined">lock</span> Locked
              } @else {
                Available
              }
            </dd>
          </div>
        </dl>
        <p class="note">{{ suiteAccess().customerMessage }}</p>
        @if (canRenewSuite()) {
          <div class="btn-row">
            <a routerLink="/suite-access/checkout" [queryParams]="{ plan: 'monthly' }" class="bb-btn bb-btn-outline">Renew R100 / month</a>
            <a routerLink="/suite-access/checkout" [queryParams]="{ plan: 'quarterly' }" class="bb-btn bb-btn-primary">Renew R200 / quarter</a>
          </div>
        }
      </section>

      <section class="bb-card bb-card-pad">
        <h2 class="bb-card-title">🇿🇦 Delivery Address</h2>
          <p class="addr-title">{{ suiteAddress()?.label }}</p>
          <p class="addr-line"><strong>{{ suiteAddress()?.recipientName }}</strong></p>
          <p class="addr-line">Suite {{ suiteAddress()?.suiteNumber }}</p>
          <p class="addr-line">{{ suiteStreetLine() }}</p>
          <p class="addr-line">
            {{ suiteAddress()?.city }}, {{ suiteAddress()?.province }} {{ suiteAddress()?.postalCode }}
          </p>
        <p class="bb-info"><span class="material-icons-outlined">info</span> Use suite {{ suiteAccess().suiteNumber }} on all deliveries.</p>
        <a routerLink="/my-address" [queryParams]="{ tab: 'suite' }" class="bb-link">View full address details →</a>
      </section>

      <section class="bb-card bb-card-pad">
        <div class="card-head">
          <h2 class="bb-card-title">Recent Parcel Activity</h2>
          <a routerLink="/received-parcels" class="bb-link">View all</a>
        </div>
        @if (recentActivity().length === 0) {
          <p class="empty-activity">No parcels yet. Use your suite address when shopping in South Africa.</p>
        } @else {
          <ul class="activity">
            @for (a of recentActivity(); track a.tracking) {
              <li>
                <div>
                  <strong>{{ a.item }}</strong>
                  <span class="track">{{ a.tracking }}</span>
                </div>
                <span class="bb-pill" [class]="pillClass(a.status)">{{ a.status }}</span>
                <span class="date">{{ a.date }}</span>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: `
    .hero {
      margin-bottom: 1.25rem;
      border-radius: var(--bb-radius);
    }
    .hero-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.85rem;
    }
    .hero-link {
      font-size: 0.78rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.65);
      text-decoration: none;
    }
    .hero-link:hover { color: var(--bb-lime); }
    .hero-route {
      margin: 0 0 0.25rem;
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .hero-id {
      margin: 0 0 1rem;
      font-size: 0.82rem;
      opacity: 0.55;
    }
    .hero .bb-progress { margin-bottom: 0.65rem; }
    .hero-meta {
      margin: 0 0 1.25rem;
      font-size: 0.78rem;
      opacity: 0.65;
    }
    .hero-actions {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.5rem;
    }
    @media (max-width: 640px) {
      .hero-actions { grid-template-columns: repeat(2, 1fr); }
    }
    .hero-action {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      padding: 0.65rem 0.5rem;
      border-radius: var(--bb-radius-sm);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.85);
      text-decoration: none;
      font-size: 0.72rem;
      font-weight: 600;
      transition: background 0.15s;
    }
    .hero-action:hover {
      background: rgba(255, 255, 255, 0.12);
      color: var(--bb-lime);
    }
    .hero-action .material-icons-outlined { font-size: 22px !important; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    @media (max-width: 1100px) { .stats { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 640px) {
      .stats { grid-template-columns: 1fr; }
      .activity li {
        grid-template-columns: 1fr;
        gap: 0.35rem;
      }
      .activity .date { justify-self: start; }
      .btn-row .bb-btn { width: 100%; }
    }
    .stat {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.75rem 1rem;
      padding: 1.1rem 1.2rem;
      align-items: start;
    }
    .stat-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      grid-row: span 2;
    }
    .stat-icon[data-color='blue'] { background: var(--bb-primary-soft); color: var(--bb-ink); }
    .stat-icon[data-color='orange'] { background: var(--bb-warning-soft); color: #b45309; }
    .stat-icon[data-color='teal'] { background: #e0f2fe; color: #0284c7; }
    .stat-icon[data-color='green'] { background: var(--bb-success-soft); color: #15803d; }
    .stat-val { margin: 0; font-size: 1.5rem; font-weight: 700; color: var(--bb-text); }
    .stat-lbl { margin: 0.1rem 0 0; font-size: 0.8rem; color: var(--bb-muted); }
    .stat-link { grid-column: 2; font-size: 0.82rem; font-weight: 600; color: var(--bb-link); text-decoration: underline; text-decoration-color: var(--bb-lime); text-underline-offset: 2px; }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.15rem;
      margin-bottom: 1.15rem;
    }
    @media (max-width: 1100px) { .grid-3 { grid-template-columns: 1fr; } }
    .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
    .kv { margin: 0 0 1rem; }
    .kv > div {
      display: grid;
      grid-template-columns: 110px 1fr;
      padding: 0.4rem 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.85rem;
    }
    .kv dt { color: var(--bb-muted); font-weight: 500; margin: 0; }
    .kv dd { margin: 0; font-weight: 600; color: var(--bb-text); }
    .kv .danger { color: var(--bb-danger); display: flex; align-items: center; gap: 0.2rem; }
    .note { font-size: 0.78rem; color: var(--bb-muted); margin: 0 0 1rem; }
    .btn-row { display: flex; flex-direction: column; gap: 0.5rem; }
    .addr-title { font-weight: 700; margin: 0 0 0.35rem; font-size: 0.9rem; }
    .addr-line { margin: 0 0 0.2rem; font-size: 0.85rem; color: var(--bb-text); }
    .info {
      display: flex;
      gap: 0.35rem;
      align-items: flex-start;
    }
    .activity { list-style: none; margin: 0; padding: 0; }
    .activity li {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 0.5rem 0.75rem;
      align-items: center;
      padding: 0.65rem 0;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.82rem;
    }
    .activity strong { display: block; font-size: 0.85rem; }
    .track { color: var(--bb-muted); font-size: 0.72rem; }
    .date { color: var(--bb-muted); font-size: 0.72rem; }
    .empty-activity { margin: 0; font-size: 0.85rem; color: var(--bb-muted); }
  `,
})
export class DashboardComponent implements OnInit {
  private readonly accountApi = inject(CustomerAccountService);
  private readonly parcelsApi = inject(ParcelsService);

  readonly suiteAccess = computed(
    () =>
      this.parcelsApi.dashboard()?.suiteAccess ?? {
        status: 'Pending',
        shipOutLocked: true,
        customerMessage: 'Activate suite access to receive parcels.',
        suiteNumber: null,
        expiresAt: null,
      },
  );

  readonly suiteLastDay = computed(() => {
    const raw = this.suiteAccess().expiresAt;
    if (!raw) return null;
    return this.formatDisplayDate(raw);
  });

  readonly canRenewSuite = computed(() => {
    const access = this.suiteAccess();
    if (access.shipOutLocked) return true;
    const raw = access.expiresAt;
    if (!raw) return false;
    return Date.parse(raw) <= Date.now();
  });

  readonly suiteAddress = () => this.accountApi.account()?.suiteAddress;

  suiteStreetLine(): string {
    const suite = this.suiteAddress();
    if (!suite) return '';
    return suite.line2?.trim() ? `${suite.line1}, ${suite.line2}` : suite.line1;
  }

  readonly recentActivity = computed(() =>
    this.parcelsApi.parcels().slice(0, 4).map((p) => ({
      item: p.itemName,
      tracking: p.trackingNumber ?? p.id,
      status: p.status,
      date: this.parcelsApi.displayDate(p.receivedAtUtc),
    })),
  );

  readonly statCards = computed(() => {
    const s = this.parcelsApi.summary();
    const dash = this.parcelsApi.dashboard();
    return [
      { title: 'Received', value: String(s.total), label: 'Parcels in suite', icon: 'inventory_2', color: 'blue', link: '/received-parcels', cta: 'View parcels' },
      { title: 'Ready', value: String(s.ready), label: 'Ready to ship', icon: 'local_shipping', color: 'orange', link: '/received-parcels', cta: 'View ready' },
      { title: 'Invoices', value: String(s.pending), label: 'Pending upload', icon: 'upload_file', color: 'teal', link: '/received-parcels', cta: 'Upload' },
      {
        title: 'Suite',
        value: dash?.suiteAccess.status ?? '—',
        label: 'Access status',
        icon: 'verified_user',
        color: 'green',
        link: this.canRenewSuite() ? '/suite-access/checkout' : '/dashboard',
        cta: this.canRenewSuite() ? 'Renew' : 'Active',
      },
    ];
  });

  readonly heroCard = computed(() => {
    const access = this.suiteAccess();
    const summary = this.parcelsApi.summary();
    const suite = access.suiteNumber;
    let progress = 25;
    if (!access.shipOutLocked) progress = 45;
    if (summary.total > 0) progress = 65;
    if (summary.ready > 0) progress = 85;
    if (summary.total > 0 && summary.ready === summary.total) progress = 100;

    const meta = access.shipOutLocked
      ? access.customerMessage
      : summary.ready > 0
        ? `${summary.ready} parcel${summary.ready === 1 ? '' : 's'} ready to ship`
        : summary.total > 0
          ? `${summary.total} parcel${summary.total === 1 ? '' : 's'} in your suite`
          : 'Use your suite address when shopping in South Africa';

    return {
      route: 'South Africa → Eswatini',
      suiteNumber: suite,
      statusLabel: access.shipOutLocked ? access.status.toUpperCase() : 'ACTIVE',
      progress,
      meta,
    };
  });

  ngOnInit(): void {
    if (!this.accountApi.account()) {
      this.accountApi.loadAccount().subscribe();
    }
    this.parcelsApi.loadDashboard().subscribe();
    this.parcelsApi.loadParcels().subscribe();
  }

  pillClass(status: string): string {
    if (status.includes('Ready')) return 'bb-pill-ready';
    if (status.includes('Transit')) return 'bb-pill-transit';
    if (status.includes('Delivered')) return 'bb-pill-received';
    return 'bb-pill-received';
  }

  private formatDisplayDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
