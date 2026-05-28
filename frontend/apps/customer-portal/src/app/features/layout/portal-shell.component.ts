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
import {
  readSidebarNavExpanded,
  writeSidebarNavExpanded,
} from '@wayel/shared/utils/sidebar-nav-preference';
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
    { path: '/received-parcels', label: 'Packages', icon: 'local_shipping' },
    { path: '/my-address', label: 'My Address', icon: 'pin_drop' },
    { path: '/quotes/list', label: 'Quotes', icon: 'request_quote' },
    { path: '/suite-access/checkout', label: 'Payments', icon: 'payments' },
    { path: '/tracking-support', label: 'Support', icon: 'support_agent' },
  ];
}

@Component({
  selector: 'app-portal-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" [class.shell-nav-open]="sidebarOpen()">
      @if (sidebarOpen()) {
        <button
          type="button"
          class="sidebar-backdrop"
          aria-label="Close navigation menu"
          (click)="closeSidebar()"
        ></button>
      }

      <aside
        class="sidebar"
        [class.sidebar-open]="sidebarOpen()"
        [class.sidebar-expanded]="desktopExpanded()"
      >
        <div class="sidebar-head">
          <a routerLink="/dashboard" class="brand-mark" (click)="closeSidebar()" [attr.title]="productName">
            <span class="material-icons-outlined brand-icon">inventory_2</span>
            <span class="brand-wordmark">{{ productName }}</span>
          </a>
          <button
            type="button"
            class="sidebar-close"
            aria-label="Close menu"
            (click)="closeSidebar()"
          >
            <span class="material-icons-outlined">close</span>
          </button>
        </div>

        <nav class="nav" aria-label="Main">
          @for (item of nav(); track item.path + item.label) {
            <a
              [routerLink]="item.path"
              routerLinkActive="active"
              [routerLinkActiveOptions]="navActiveOptions(item)"
              [attr.title]="item.label"
              (click)="closeSidebar()"
            >
              <span class="material-icons-outlined nav-icon">{{ item.icon }}</span>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        </nav>

        <button
          type="button"
          class="sidebar-rail-toggle"
          [attr.aria-label]="desktopExpanded() ? 'Collapse navigation' : 'Expand navigation'"
          [attr.aria-expanded]="desktopExpanded()"
          (click)="toggleDesktopExpanded()"
        >
          <span class="material-icons-outlined" aria-hidden="true">
            {{ desktopExpanded() ? 'chevron_left' : 'chevron_right' }}
          </span>
        </button>

        <button type="button" class="nav-logout" title="Sign out" (click)="signOut()">
          <span class="material-icons-outlined">logout</span>
          <span class="nav-label">Sign out</span>
        </button>
      </aside>

      <div class="main">
        <header class="topbar">
          <button
            type="button"
            class="menu-btn"
            aria-label="Open navigation menu"
            [attr.aria-expanded]="sidebarOpen()"
            (click)="toggleSidebar()"
          >
            <span class="material-icons-outlined">menu</span>
          </button>

          <div class="topbar-greeting bb-hide-md-down">
            <span class="greeting-eyebrow">Welcome back</span>
            <strong class="greeting-name">{{ displayName() }}</strong>
          </div>

          <label class="search bb-search-pill">
            <span class="material-icons-outlined">search</span>
            <input type="search" placeholder="Track parcel, quote, or invoice…" />
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
              <span class="flag">🇸🇿</span>
              <span class="country-label">Eswatini</span>
              <span class="material-icons-outlined expand-icon">expand_more</span>
            </button>
            <button type="button" class="user-btn" (click)="signOut()" aria-label="Account menu — sign out">
              <span class="avatar">{{ initials() }}</span>
              <span class="user-name">{{ displayName() }}</span>
              <span class="material-icons-outlined expand-icon">expand_more</span>
            </button>
          </div>
        </header>

        <main class="content" [class.content-map]="mapLayout()">
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
      background: var(--sidebar-bg);
      color: #fff;
      display: flex;
      flex-direction: column;
      padding: 1rem 0.65rem;
      position: sticky;
      top: 0;
      height: 100vh;
      z-index: 100;
      overflow: visible;
    }

    .sidebar-head {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.25rem;
      padding-bottom: 0.5rem;
    }

    .brand-mark {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      text-decoration: none;
      color: inherit;
    }

    .brand-icon {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.08);
      font-size: 24px !important;
      color: var(--bb-lime);
    }

    .brand-wordmark {
      display: none;
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
    }

    .nav {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .nav a,
    .nav-logout {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.75rem;
      border-radius: 14px;
      color: var(--sidebar-text);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      border: none;
      background: transparent;
      cursor: pointer;
      width: 100%;
      justify-content: center;
    }

    .nav-label {
      display: none;
    }

    .nav a:hover,
    .nav-logout:hover {
      background: var(--sidebar-bg-hover);
      color: #fff;
    }

    .nav a.active {
      background: var(--sidebar-bg-active);
      color: var(--sidebar-text-active);
      font-weight: 700;
    }

    .nav a.active .nav-icon {
      color: var(--bb-ink);
    }

    .nav-icon {
      font-size: 22px !important;
    }

    .nav-logout {
      margin-top: auto;
      color: rgba(255, 255, 255, 0.45);
    }

    .main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .topbar {
      min-height: var(--bb-topbar-h);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.5rem;
      background: var(--bb-bg);
    }

    .topbar-greeting {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
      min-width: 0;
    }

    .greeting-eyebrow {
      font-size: 0.72rem;
      color: var(--bb-muted);
      font-weight: 500;
    }

    .greeting-name {
      font-size: 1rem;
      font-weight: 700;
      color: var(--bb-text);
      letter-spacing: -0.02em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search {
      flex: 1;
      max-width: 420px;
      margin-left: auto;
    }

    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .icon-btn {
      position: relative;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: var(--bb-radius-pill);
      background: var(--bb-surface);
      color: var(--bb-muted);
      cursor: pointer;
      box-shadow: var(--bb-shadow);
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
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow-md);
      z-index: 50;
    }

    .notif-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.85rem 1rem;
      border-bottom: 1px solid var(--bb-border);
      font-size: 0.85rem;
    }

    .notif-mark-all {
      border: none;
      background: transparent;
      color: var(--bb-ink);
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
      text-decoration-color: var(--bb-lime);
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
      padding: 0.85rem 1rem;
      border: none;
      border-bottom: 1px solid var(--bb-border);
      background: #fff;
      text-align: left;
      cursor: pointer;
    }

    .notif-item:hover { background: var(--bb-surface-muted); }
    .notif-item.unread { background: var(--bb-lime-soft); }
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
      background: var(--bb-ink);
      color: var(--bb-lime);
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
      padding: 0.35rem 0.65rem;
      border: none;
      border-radius: var(--bb-radius-pill);
      background: var(--bb-surface);
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--bb-text);
      box-shadow: var(--bb-shadow);
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--bb-ink);
      color: var(--bb-lime);
      font-size: 0.72rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .user-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .content {
      flex: 1;
      overflow-y: auto;
      padding: var(--bb-content-pad-y) var(--bb-content-pad-x) 2.5rem;
    }

    .content.content-map {
      padding: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .menu-btn,
    .sidebar-close,
    .sidebar-backdrop,
    .sidebar-rail-toggle {
      display: none;
    }

    .sidebar-close {
      flex-shrink: 0;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: var(--bb-radius-sm);
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      cursor: pointer;
      align-items: center;
      justify-content: center;
    }

    @media (max-width: 1023px) {
      .sidebar {
        position: fixed;
        left: 0;
        top: 0;
        width: var(--bb-sidebar-w-expanded);
        padding: 1.25rem 1rem;
        height: 100%;
        height: 100dvh;
        transform: translateX(-100%);
        transition: transform 0.22s ease;
        box-shadow: none;
      }

      .sidebar.sidebar-open {
        transform: translateX(0);
        box-shadow: 8px 0 32px rgba(0, 0, 0, 0.28);
      }

      .sidebar-head {
        justify-content: space-between;
        margin-bottom: 1.5rem;
      }

      .brand-mark {
        flex-direction: row;
        align-items: center;
      }

      .brand-wordmark {
        display: block;
      }

      .nav a,
      .nav-logout {
        justify-content: flex-start;
        padding: 0.75rem 1rem;
      }

      .nav-label {
        display: inline;
      }

      .sidebar-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 99;
        border: none;
        padding: 0;
        margin: 0;
        background: rgba(41, 41, 40, 0.55);
        cursor: pointer;
      }

      .sidebar-close {
        display: inline-flex;
      }

      .menu-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        border: none;
        border-radius: var(--bb-radius-pill);
        background: var(--bb-surface);
        color: var(--bb-text);
        cursor: pointer;
        box-shadow: var(--bb-shadow);
      }

      .topbar {
        gap: 0.5rem;
        padding: 0.65rem 1rem;
      }

      .search {
        flex: 1;
        min-width: 0;
        max-width: none;
        margin-left: 0;
      }

      .country-label,
      .user-name,
      .expand-icon {
        display: none;
      }

      .topbar-actions {
        gap: 0.35rem;
      }

      .country-btn,
      .user-btn {
        padding: 0.35rem;
      }
    }

    @media (max-width: 767px) {
      .search {
        display: none;
      }
    }

    @media (max-width: 480px) {
      .country-btn {
        display: none;
      }
    }

    @media (min-width: 1024px) {
      .shell-nav-open {
        overflow: visible;
      }

      .sidebar {
        transition: width 0.22s ease, padding 0.22s ease;
      }

      .sidebar.sidebar-expanded {
        width: var(--bb-sidebar-w-expanded);
        padding-left: 1rem;
        padding-right: 1rem;
      }

      .sidebar-rail-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: absolute;
        top: 50%;
        right: -13px;
        transform: translateY(-50%);
        width: 26px;
        height: 26px;
        padding: 0;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 999px;
        background: var(--sidebar-bg);
        color: rgba(255, 255, 255, 0.9);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
        cursor: pointer;
        z-index: 2;
      }

      .sidebar-rail-toggle:hover {
        background: #3a3a38;
        color: #fff;
      }

      .sidebar-rail-toggle .material-icons-outlined {
        font-size: 1.1rem !important;
      }

      .sidebar.sidebar-expanded .brand-mark {
        flex-direction: row;
        align-items: center;
        gap: 0.65rem;
      }

      .sidebar.sidebar-expanded .brand-wordmark {
        display: block;
      }

      .sidebar.sidebar-expanded .nav a,
      .sidebar.sidebar-expanded .nav-logout {
        flex-direction: row;
        justify-content: flex-start;
        padding: 0.75rem 1rem;
      }

      .sidebar.sidebar-expanded .nav-label {
        display: inline;
        font-size: 0.85rem;
      }

      .sidebar:not(.sidebar-expanded) .nav a,
      .sidebar:not(.sidebar-expanded) .nav-logout {
        flex-direction: column;
        gap: 0.2rem;
        padding: 0.45rem 0.15rem;
        font-size: 0.62rem;
      }

      .sidebar:not(.sidebar-expanded) .nav-label {
        display: -webkit-box;
        flex: none;
        max-width: 100%;
        font-size: 0.58rem;
        line-height: 1.15;
        text-align: center;
        white-space: normal;
        overflow: hidden;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
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

  readonly sidebarOpen = signal(false);
  readonly desktopExpanded = signal(readSidebarNavExpanded('customer'));
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

  readonly mapLayout = computed(() => {
    const url = this.url() ?? '';
    return (
      url === '/received-parcels' ||
      url.startsWith('/received-parcels?') ||
      url.includes('/track')
    );
  });

  ngOnInit(): void {
    if (!this.accountApi.account()) {
      this.accountApi.loadAccount().subscribe();
    }
    this.refreshUnreadCount();
    interval(60_000)
      .pipe(startWith(0))
      .subscribe(() => this.refreshUnreadCount());

    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.closeSidebar());
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
    if (this.sidebarOpen()) {
      this.notifOpen.set(false);
    }
    this.syncBodyScrollLock();
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
    this.syncBodyScrollLock();
  }

  toggleDesktopExpanded(): void {
    this.desktopExpanded.update((open) => {
      const next = !open;
      writeSidebarNavExpanded('customer', next);
      return next;
    });
  }

  private syncBodyScrollLock(): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.style.overflow = this.sidebarOpen() ? 'hidden' : '';
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
