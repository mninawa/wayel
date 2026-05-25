import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, interval, startWith, catchError, of } from 'rxjs';
import { AccountSessionService } from '@wayel/shared/services/account-session.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../../brand';
import { CustomerAccountService } from '../../services/customer-account.service';
import { BorderboxApiService } from '../../services/borderbox-api.service';
import {
  CustomerInAppNotificationsApiService,
  type CustomerInAppNotification,
} from '../../services/customer-inapp-notifications-api.service';
interface NavItem {
  path: string;
  label: string;
  icon: string;
}

function buildNav(): NavItem[] {
  return [
    { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { path: '/my-address', label: 'My Address', icon: 'pin_drop' },
    { path: '/received-parcels', label: 'Parcels', icon: 'inventory_2' },
    { path: '/quotes/list', label: 'Quotes', icon: 'request_quote' },
    { path: '/suite-access/checkout', label: 'Payments', icon: 'payments' },
    { path: '/tracking-support', label: 'Tracking & Support', icon: 'headset_mic' },
  ];
}

@Component({
  selector: 'app-portal-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="sidebar">
        <a routerLink="/dashboard" class="brand">
          <span class="brand-wordmark">{{ productName }}</span>
          <span class="brand-text">
            <small>{{ productTagline }}</small>
          </span>
        </a>

        <nav class="nav">
          @for (item of nav(); track item.path + item.label) {
            <a
              [routerLink]="item.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="navActiveOptions(item)"
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
            <div class="notif-wrap">
              <button
                type="button"
                class="icon-btn"
                aria-label="Notifications"
                [attr.aria-expanded]="notifOpen()"
                (click)="toggleNotifications()"
              >
                <span class="material-icons-outlined">notifications</span>
                @if (unreadCount() > 0) {
                  <span class="badge">{{ unreadBadge() }}</span>
                }
              </button>
              @if (notifOpen()) {
                <div class="notif-panel" role="dialog" aria-label="Notifications">
                  <div class="notif-head">
                    <strong>Notifications</strong>
                    @if (unreadCount() > 0) {
                      <button type="button" class="notif-mark-all" (click)="markAllNotificationsRead()">
                        Mark all read
                      </button>
                    }
                  </div>
                  @if (notificationsLoading()) {
                    <p class="notif-empty">Loading…</p>
                  } @else if (notifications().length === 0) {
                    <p class="notif-empty">No notifications yet.</p>
                  } @else {
                    <ul class="notif-list">
                      @for (n of notifications(); track n.id) {
                        <li>
                          <button
                            type="button"
                            class="notif-item"
                            [class.unread]="!n.readAtUtc"
                            (click)="openNotification(n)"
                          >
                            <span class="notif-title">{{ n.title }}</span>
                            <span class="notif-body">{{ n.body }}</span>
                            <span class="notif-time">{{ formatNotifTime(n.createdAtUtc) }}</span>
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </div>
              }
            </div>
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
      flex-direction: column;
      gap: 0.5rem;
      text-decoration: none;
      color: inherit;
      padding: 0 0.35rem 1.25rem;
      border-bottom: 1px solid var(--sidebar-border);
      margin-bottom: 1rem;
    }

    .brand-wordmark {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.1;
      color: var(--bb-brand-purple, #845ec2);
    }

    .brand-text {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }

    .brand-text small {
      font-size: 0.65rem;
      color: rgba(255, 255, 255, 0.58);
      margin-top: 0.15rem;
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
      cursor: pointer;
    }

    .notif-wrap { position: relative; }

    .notif-panel {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      width: min(360px, 92vw);
      max-height: 420px;
      overflow: auto;
      background: #fff;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.12);
      z-index: 50;
    }

    .notif-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--bb-border);
      font-size: 0.85rem;
    }

    .notif-mark-all {
      border: none;
      background: transparent;
      color: var(--bb-brand-purple, #845ec2);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }

    .notif-empty {
      margin: 0;
      padding: 1.25rem 1rem;
      color: var(--bb-muted);
      font-size: 0.82rem;
    }

    .notif-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .notif-item {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.2rem;
      width: 100%;
      padding: 0.75rem 1rem;
      border: none;
      border-bottom: 1px solid var(--bb-border);
      background: #fff;
      text-align: left;
      cursor: pointer;
    }

    .notif-item:hover { background: #f8fafc; }
    .notif-item.unread { background: #f5f3ff; }
    .notif-title { font-size: 0.82rem; font-weight: 600; color: var(--bb-text); }
    .notif-body { font-size: 0.78rem; color: var(--bb-muted); line-height: 1.35; }
    .notif-time { font-size: 0.7rem; color: var(--bb-muted); margin-top: 0.15rem; }

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
  readonly nav = signal(buildNav());

  private readonly session = inject(AccountSessionService);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly borderboxApi = inject(BorderboxApiService);
  private readonly notificationsApi = inject(CustomerInAppNotificationsApiService);
  private readonly router = inject(Router);

  readonly notifOpen = signal(false);
  readonly notificationsLoading = signal(false);
  readonly notifications = signal<CustomerInAppNotification[]>([]);
  readonly unreadCount = signal(0);

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
    this.refreshUnreadCount();
    interval(60_000)
      .pipe(startWith(0))
      .subscribe(() => this.refreshUnreadCount());
  }

  unreadBadge(): string {
    const n = this.unreadCount();
    return n > 99 ? '99+' : String(n);
  }

  toggleNotifications(): void {
    const open = !this.notifOpen();
    this.notifOpen.set(open);
    if (open) {
      this.loadNotifications();
    }
  }

  private loadNotifications(): void {
    this.notificationsLoading.set(true);
    this.notificationsApi.list(15).subscribe({
      next: (res) => {
        this.notifications.set(res.items);
        this.unreadCount.set(res.unreadCount);
        this.notificationsLoading.set(false);
      },
      error: () => this.notificationsLoading.set(false),
    });
  }

  private refreshUnreadCount(): void {
    this.notificationsApi
      .unreadCount()
      .pipe(catchError(() => of({ unreadCount: 0 })))
      .subscribe((res) => this.unreadCount.set(res.unreadCount));
  }

  openNotification(n: CustomerInAppNotification): void {
    if (!n.readAtUtc) {
      this.notificationsApi.markRead(n.id).subscribe({
        next: () => {
          this.notifications.update((list) =>
            list.map((item) =>
              item.id === n.id ? { ...item, readAtUtc: new Date().toISOString() } : item,
            ),
          );
          this.unreadCount.update((c) => Math.max(0, c - 1));
        },
      });
    }
    this.notifOpen.set(false);
    if (n.linkPath) {
      void this.router.navigateByUrl(n.linkPath);
    }
  }

  markAllNotificationsRead(): void {
    this.notificationsApi.markAllRead().subscribe({
      next: () => {
        const now = new Date().toISOString();
        this.notifications.update((list) => list.map((n) => ({ ...n, readAtUtc: n.readAtUtc ?? now })));
        this.unreadCount.set(0);
      },
    });
  }

  formatNotifTime(iso: string): string {
    try {
      const d = new Date(iso);
      const diff = Date.now() - d.getTime();
      if (diff < 60_000) return 'Just now';
      if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
      if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
      return d.toLocaleDateString();
    } catch {
      return '';
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

  navActiveOptions(item: NavItem): { exact: boolean } {
    if (item.path.startsWith('/quotes') || item.path === '/suite-access/checkout') {
      return { exact: false };
    }
    if (item.path === '/dashboard') {
      return { exact: true };
    }
    return { exact: false };
  }
}
