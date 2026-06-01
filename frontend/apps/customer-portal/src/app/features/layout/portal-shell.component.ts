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
import {
  CustomerInAppNotificationsApiService,
  type CustomerInAppNotification,
} from '../../services/customer-inapp-notifications-api.service';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { PortalSearchService, type PortalSearchHit } from '../../services/portal-search.service';
import { ParcelsService } from '../../services/parcels.service';
import { KycVerificationTickerComponent } from './kyc-verification-ticker.component';
interface NavItem {
  path: string;
  label: string;
  icon: string;
}

function buildNav(): NavItem[] {
  return [
    { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { path: '/my-address', label: 'My Address', icon: 'pin_drop' },
    { path: '/received-parcels', label: 'Parcels', icon: 'local_shipping' },
    { path: '/quotes/list', label: 'Quotes', icon: 'request_quote' },
    { path: '/suite-access/checkout', label: 'Payments', icon: 'payments' },
    { path: '/tracking-support', label: 'Support', icon: 'support_agent' },
  ];
}

@Component({
  selector: 'app-portal-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, KycVerificationTickerComponent, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" [class.shell-nav-open]="sidebarOpen()" [class.shell-sidebar-expanded]="desktopExpanded()">
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
            <span class="brand-logo-wrap">
              <img src="/weyell-brand-logo.png" alt="" class="brand-logo-compact" aria-hidden="true" />
              <img src="/weyell-brand-logo.png" [alt]="productName" class="brand-logo-full" />
            </span>
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

        <div class="sidebar-promo">
          <p class="sidebar-promo-title">More destinations coming soon!</p>
          <span class="sidebar-promo-cta">Stay tuned →</span>
        </div>

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

      <div class="main" [class.main-has-kyc-ticker]="showKycTicker()">
        @if (notifOpen()) {
          <button
            type="button"
            class="notif-backdrop"
            aria-label="Close notifications"
            (click)="closeNotifications()"
          ></button>
        }

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

          <div class="search-wrap">
            @if (searchOpen()) {
              <button
                type="button"
                class="search-backdrop"
                aria-label="Close search"
                (click)="closeSearch()"
              ></button>
            }

            <label class="search bb-search-pill">
              <span class="material-icons-outlined">search</span>
              <input
                type="search"
                [value]="searchQuery()"
                placeholder="Search parcels, shipments, quotes, invoices…"
                aria-label="Search parcels, shipments, quotes, and invoices"
                aria-autocomplete="list"
                [attr.aria-expanded]="searchOpen()"
                aria-controls="portal-search-results"
                (input)="onSearchInput($event)"
                (focus)="openSearch()"
                (keydown.enter)="submitSearch($event)"
                (keydown.escape)="closeSearch()"
              />
              @if (searchQuery()) {
                <button type="button" class="search-clear" aria-label="Clear search" (click)="clearSearch()">
                  <span class="material-icons-outlined">close</span>
                </button>
              }
            </label>

            @if (searchOpen() && searchQuery().trim().length >= 2) {
              <div id="portal-search-results" class="search-panel" role="listbox" aria-label="Search results">
                @if (searchLoading()) {
                  <nk-pulse-loader size="sm" [block]="false" label="Searching…" />
                } @else if (searchResults().length === 0) {
                  <p class="search-empty">No matches for “{{ searchQuery().trim() }}”.</p>
                } @else {
                  <ul class="search-list">
                    @for (hit of searchResults(); track hit.key) {
                      <li>
                        <button type="button" class="search-hit" role="option" (click)="goToHit(hit)">
                          <span class="material-icons-outlined search-hit-icon">{{ hit.icon }}</span>
                          <span class="search-hit-body">
                            <span class="search-hit-title">{{ hit.title }}</span>
                            <span class="search-hit-meta">{{ hit.meta }}</span>
                          </span>
                          <span class="material-icons-outlined search-hit-arrow">north_east</span>
                        </button>
                      </li>
                    }
                  </ul>
                  <button type="button" class="search-foot" (click)="viewAllResults()">
                    View all matches in parcel table
                  </button>
                }
              </div>
            }
          </div>

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
                    <nk-pulse-loader size="sm" [block]="false" label="Loading…" />
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

        @if (showKycTicker()) {
          <app-kyc-verification-ticker />
        }

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
      --portal-sidebar-offset: var(--bb-sidebar-w);
    }

    @media (min-width: 1024px) {
      .shell.shell-sidebar-expanded {
        --portal-sidebar-offset: var(--bb-sidebar-w-expanded);
      }
    }

    @media (max-width: 1023px) {
      .shell {
        --portal-sidebar-offset: 0px;
      }
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
      gap: 0;
      text-decoration: none;
      color: inherit;
      width: 100%;
    }

    .brand-logo-wrap {
      display: block;
      width: 100%;
      overflow: hidden;
    }

    .brand-logo-full {
      display: none;
      width: 100%;
      max-width: 168px;
      height: auto;
      margin: 0 auto;
    }

    .brand-logo-compact {
      display: block;
      width: 44px;
      height: 36px;
      object-fit: cover;
      object-position: top center;
      margin: 0 auto;
    }

    .sidebar-promo {
      display: none;
      flex-direction: column;
      gap: 0.35rem;
      margin-top: auto;
      margin-bottom: 0.5rem;
      padding: 0.85rem 0.75rem;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .sidebar-promo-title {
      margin: 0;
      font-size: 0.72rem;
      line-height: 1.35;
      color: rgba(255, 255, 255, 0.82);
      font-weight: 600;
    }

    .sidebar-promo-cta {
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--bb-lime);
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
      font-weight: 600;
      box-shadow: inset 3px 0 0 var(--sidebar-active-border);
    }

    .nav a.active .nav-icon {
      color: var(--sidebar-text-active);
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
      overflow: visible;
    }

    .topbar {
      min-height: var(--bb-topbar-h);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1.5rem;
      background: var(--bb-bg);
      position: relative;
      z-index: 20;
      overflow: visible;
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

    .search-wrap {
      position: relative;
      flex: 1;
      max-width: 420px;
      margin-left: auto;
      z-index: 25;
    }

    .search-wrap .search {
      margin-left: 0;
      max-width: none;
      width: 100%;
    }

    .search-clear {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 999px;
      background: transparent;
      color: var(--bb-muted);
      cursor: pointer;
      flex-shrink: 0;
    }

    .search-clear:hover {
      background: rgba(0, 0, 0, 0.06);
      color: var(--bb-text);
    }

    .search-backdrop {
      display: none;
    }

    .search-panel {
      position: absolute;
      top: calc(100% + 0.5rem);
      left: 0;
      right: 0;
      max-height: min(420px, 70vh);
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      background: #fff;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow-md);
      z-index: 120;
    }

    .search-empty {
      margin: 0;
      padding: 1rem 1.1rem;
      color: var(--bb-muted);
      font-size: 0.82rem;
    }

    .search-list {
      list-style: none;
      margin: 0;
      padding: 0.35rem 0;
    }

    .search-hit {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      width: 100%;
      padding: 0.75rem 1rem;
      border: none;
      background: #fff;
      text-align: left;
      cursor: pointer;
      color: inherit;
    }

    .search-hit:hover {
      background: var(--bb-surface-muted);
    }

    .search-hit-icon {
      color: var(--bb-ink);
      font-size: 1.25rem !important;
      flex-shrink: 0;
    }

    .search-hit-body {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 0;
      flex: 1;
    }

    .search-hit-title {
      font-size: 0.84rem;
      font-weight: 600;
      color: var(--bb-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-hit-meta {
      font-size: 0.74rem;
      color: var(--bb-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .search-hit-arrow {
      color: var(--bb-subtle);
      font-size: 1rem !important;
      flex-shrink: 0;
    }

    .search-foot {
      display: block;
      width: 100%;
      padding: 0.75rem 1rem;
      border: none;
      border-top: 1px solid var(--bb-border);
      background: var(--bb-surface-muted);
      color: var(--bb-ink);
      font-size: 0.78rem;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }

    .search-foot:hover {
      background: #eceef0;
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

    .notif-wrap {
      position: relative;
      z-index: 30;
    }

    .notif-backdrop {
      display: none;
    }

    .notif-panel {
      position: absolute;
      top: calc(100% + 0.5rem);
      right: 0;
      left: auto;
      width: min(360px, calc(100vw - 2rem));
      max-height: min(420px, 70vh);
      overflow: auto;
      -webkit-overflow-scrolling: touch;
      background: #fff;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow-md);
      z-index: 120;
      color: var(--bb-text);
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

      .brand-logo-compact {
        display: none;
      }

      .brand-logo-full {
        display: block;
        max-width: 140px;
      }

      .sidebar-promo {
        display: flex;
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

      .search-wrap {
        flex: 1;
        min-width: 0;
        max-width: none;
        margin-left: 0;
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
      .search-wrap {
        display: none;
      }

      /* Without the search bar, actions must pin right or the dropdown opens over the menu. */
      .topbar-actions {
        margin-left: auto;
      }

      .notif-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 110;
        border: none;
        padding: 0;
        margin: 0;
        background: rgba(41, 41, 40, 0.45);
        cursor: pointer;
      }

      .notif-panel {
        position: fixed;
        top: calc(var(--bb-topbar-h) + 0.35rem);
        right: 1rem;
        left: 1rem;
        width: auto;
        max-width: none;
        max-height: min(420px, calc(100dvh - var(--bb-topbar-h) - 2rem));
      }

      .main-has-kyc-ticker .notif-panel {
        top: calc(var(--bb-topbar-h) + 2.85rem);
        max-height: min(420px, calc(100dvh - var(--bb-topbar-h) - 3.5rem));
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
        flex-direction: column;
        align-items: stretch;
        gap: 0;
      }

      .sidebar.sidebar-expanded .brand-logo-compact {
        display: none;
      }

      .sidebar.sidebar-expanded .brand-logo-full {
        display: block;
      }

      .sidebar.sidebar-expanded .sidebar-promo {
        display: flex;
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
  private readonly notificationsApi = inject(CustomerInAppNotificationsApiService);
  private readonly portalSearch = inject(PortalSearchService);
  private readonly parcelsService = inject(ParcelsService);
  private readonly router = inject(Router);

  readonly sidebarOpen = signal(false);
  readonly desktopExpanded = signal(readSidebarNavExpanded('customer'));
  readonly notifOpen = signal(false);
  readonly notificationsLoading = signal(false);
  readonly notifications = signal<CustomerInAppNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly searchQuery = signal('');
  readonly searchOpen = signal(false);
  readonly searchLoading = computed(() => this.portalSearch.indexLoading());
  readonly searchResults = computed(() =>
    this.portalSearch.search(this.searchQuery()),
  );

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

  readonly showKycTicker = computed(() => {
    const status = this.accountApi.account()?.profile.kycStatus;
    return status != null && status !== 'Verified';
  });

  ngOnInit(): void {
    if (!this.accountApi.account()) {
      this.accountApi.loadAccount().subscribe();
    }
    this.portalSearch.ensureIndex().subscribe();
    if (this.parcelsService.parcels().length === 0) {
      this.parcelsService.loadParcels().subscribe();
    }
    this.refreshUnreadCount();
    interval(60_000)
      .pipe(startWith(0))
      .subscribe(() => this.refreshUnreadCount());

    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.closeSidebar();
        this.closeSearch();
      });
  }

  openSearch(): void {
    this.searchOpen.set(true);
    this.closeNotifications();
    if (!this.portalSearch.indexLoaded()) {
      this.portalSearch.ensureIndex().subscribe();
    }
  }

  closeSearch(): void {
    this.searchOpen.set(false);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    this.openSearch();
    if (!this.portalSearch.indexLoaded()) {
      this.portalSearch.ensureIndex().subscribe();
    }
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchOpen.set(false);
  }

  submitSearch(event: Event): void {
    event.preventDefault();
    const hits = this.searchResults();
    if (hits.length > 0) {
      this.goToHit(hits[0]);
      return;
    }
    this.viewAllResults();
  }

  viewAllResults(): void {
    const q = this.searchQuery().trim();
    if (!q) {
      return;
    }
    this.closeSearch();
    void this.router.navigate(['/received-parcels/list'], { queryParams: { q } });
  }

  goToHit(hit: PortalSearchHit): void {
    this.closeSearch();
    this.searchQuery.set('');
    void this.router.navigate(hit.route);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
    if (this.sidebarOpen()) {
      this.closeNotifications();
    }
    this.syncBodyScrollLock();
  }

  closeNotifications(): void {
    this.notifOpen.set(false);
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
      this.sidebarOpen.set(false);
      this.closeSearch();
      this.syncBodyScrollLock();
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
    this.closeNotifications();
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
