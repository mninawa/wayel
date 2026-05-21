import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../../brand';
import { CustomerAccountService } from '../../services/customer-account.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  exact?: boolean;
}

const NAV: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard', exact: true },
  { path: '/my-address', label: 'My Address', icon: 'pin_drop' },
  { path: '/received-parcels', label: 'Parcels', icon: 'inventory_2' },
  { path: '/shipments/create', label: 'Shipments', icon: 'local_shipping' },
  { path: '/shipping/quote/QUO-24789', label: 'Quotes', icon: 'request_quote' },
  { path: '/suite-access/checkout', label: 'Payments', icon: 'payments' },
  { path: '/tracking-support', label: 'Tracking & Support', icon: 'headset_mic' },
];

@Component({
  selector: 'app-portal-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="sidebar">
        <a routerLink="/dashboard" class="brand">
          <span class="brand-icon" aria-hidden="true">
            <svg viewBox="0 0 36 36" width="36" height="36">
              <rect width="36" height="36" rx="8" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.25)"/>
              <path d="M10 18h16M10 13h11M10 23h14" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </span>
          <span class="brand-text">
            <strong>{{ productName }}</strong>
            <small>{{ productTagline }}</small>
          </span>
        </a>

        <nav class="nav">
          @for (item of nav; track item.path + item.label) {
            <a
              [routerLink]="item.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: !!item.exact }"
            >
              <span class="material-icons-outlined">{{ item.icon }}</span>
              {{ item.label }}
            </a>
          }
        </nav>

        <div class="sidebar-promo">
          <span class="material-icons-outlined promo-icon">public</span>
          <p><strong>More destinations coming soon!</strong></p>
          <p class="promo-sub">Stay tuned</p>
          <button type="button" class="promo-btn">Stay tuned →</button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <label class="search">
            <span class="material-icons-outlined">search</span>
            <input type="search" placeholder="Search parcels, shipments, quotes, invoices…" />
            <kbd>⌘ K</kbd>
          </label>

          <div class="topbar-actions">
            <button type="button" class="icon-btn" aria-label="Notifications">
              <span class="material-icons-outlined">notifications</span>
              <span class="badge">3</span>
            </button>
            <button type="button" class="country-btn">
              <span class="flag">🇸🇿</span> Eswatini
              <span class="material-icons-outlined">expand_more</span>
            </button>
            <button type="button" class="user-btn" (click)="signOut()">
              <span class="avatar">{{ initials() }}</span>
              <span class="user-name">{{ displayName() }}</span>
              <span class="material-icons-outlined">expand_more</span>
            </button>
          </div>
        </header>

        <main class="content">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: `
    .shell {
      display: flex;
      min-height: 100vh;
      background: var(--bb-bg);
    }

    .sidebar {
      width: var(--bb-sidebar-w);
      flex-shrink: 0;
      background: var(--bb-navy);
      color: #fff;
      display: flex;
      flex-direction: column;
      padding: 1.25rem 0.85rem 1.5rem;
      position: sticky;
      top: 0;
      height: 100vh;
    }

    .brand {
      display: flex;
      gap: 0.65rem;
      text-decoration: none;
      color: inherit;
      padding: 0 0.35rem 1.25rem;
      border-bottom: 1px solid var(--sidebar-border);
      margin-bottom: 1rem;
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }

    .brand-text strong {
      font-size: 0.95rem;
      font-weight: 700;
    }

    .brand-text small {
      font-size: 0.65rem;
      opacity: 0.65;
      margin-top: 0.2rem;
      line-height: 1.3;
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      flex: 1;
    }

    .nav a {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 0.75rem;
      border-radius: var(--bb-radius-sm);
      color: var(--sidebar-text);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
    }

    .nav a:hover { background: var(--sidebar-bg-hover); }
    .nav a.active {
      background: var(--sidebar-bg-active);
      color: var(--sidebar-text-active);
      font-weight: 600;
    }

    .sidebar-promo {
      margin-top: auto;
      padding: 1rem;
      background: var(--bb-navy-light);
      border-radius: var(--bb-radius-sm);
      border: 1px solid var(--sidebar-border);
      font-size: 0.78rem;
    }

    .promo-icon { font-size: 28px !important; opacity: 0.8; margin-bottom: 0.35rem; }
    .sidebar-promo p { margin: 0 0 0.2rem; }
    .promo-sub { opacity: 0.65; margin-bottom: 0.65rem !important; }
    .promo-btn {
      width: 100%;
      padding: 0.45rem;
      border: 1px solid rgba(255,255,255,0.25);
      border-radius: 6px;
      background: transparent;
      color: #fff;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .topbar {
      height: var(--bb-topbar-h);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0 1.5rem;
      background: var(--bb-surface);
      border-bottom: 1px solid var(--bb-border);
    }

    .search {
      flex: 1;
      max-width: 520px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.85rem;
      background: #f8fafc;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      color: var(--bb-muted);
    }

    .search input {
      flex: 1;
      border: none;
      background: transparent;
      font-size: 0.85rem;
      outline: none;
      color: var(--bb-text);
    }

    .search kbd {
      font-size: 0.68rem;
      padding: 0.15rem 0.4rem;
      border: 1px solid var(--bb-border);
      border-radius: 4px;
      background: #fff;
      color: var(--bb-muted);
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      margin-left: auto;
    }

    .icon-btn {
      position: relative;
      width: 40px;
      height: 40px;
      border: none;
      border-radius: var(--bb-radius-sm);
      background: #f8fafc;
      color: var(--bb-muted);
    }

    .badge {
      position: absolute;
      top: 4px;
      right: 4px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 999px;
      background: var(--bb-danger);
      color: #fff;
      font-size: 0.6rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .country-btn,
    .user-btn {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.35rem 0.6rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fff;
      font-size: 0.82rem;
      font-weight: 500;
      color: var(--bb-text);
    }

    .avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .user-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem 1.75rem 2.5rem;
    }
  `,
})
export class PortalShellComponent implements OnInit {
  readonly productName = PRODUCT_NAME;
  readonly productTagline = PRODUCT_TAGLINE;
  readonly nav = NAV;

  private readonly session = inject(AccountSessionService);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  displayName = computed(
    () =>
      this.accountApi.account()?.profile.displayName ??
      this.session.currentAccount()?.displayName ??
      'Customer',
  );

  ngOnInit(): void {
    if (!this.accountApi.account()) {
      this.accountApi.loadAccount().subscribe();
    }
  }

  initials = computed(() => {
    const n = this.displayName();
    const parts = n.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'SD';
  });

  signOut(): void {
    this.session.clear();
    void this.router.navigate(['/sign-in']);
  }
}
