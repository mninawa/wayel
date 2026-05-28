import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  input,
  inject,
  output,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  readSidebarNavExpanded,
  writeSidebarNavExpanded,
} from '@wayel/shared/utils/sidebar-nav-preference';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../brand';
import { OPS_CAP } from '../services/ops-permissions';
import { OPS_REGION, type OpsRegion } from '../services/ops-regions';
import { OpsReceivingContextService } from '../services/ops-receiving-context.service';
import { OpsSessionService } from '../services/ops-session.service';
import { receivingRoutes } from '../types/receiving.types';
import { collectionRoutes } from '../types/collection.types';
import { accountRoutes } from '../types/account.types';
import { platformRoutes } from '../types/platform.types';
import { warehouseRoutes } from '../types/warehouse.types';

export interface OpsNavItem {
  path: string;
  label: string;
  icon: string;
  cap?: string;
  region?: OpsRegion;
  /** Hide for scoped roles that should only see a single screen. */
  hideForRoles?: string[];
}

export interface OpsNavSection {
  id: string;
  label: string | null;
  items: OpsNavItem[];
}

@Component({
  selector: 'ops-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="sidebar"
      [class.sidebar-open]="drawerOpen()"
      [class.sidebar-expanded]="desktopExpanded()"
    >
      <div class="sidebar-head">
        <a
          [routerLink]="homeLink()"
          class="brand-mark"
          [attr.title]="productName"
          (click)="onNavClick()"
        >
          <span class="brand-logo-wrap">
            <img src="/weyell-brand-logo.png" alt="" class="brand-logo-compact" aria-hidden="true" />
            <img src="/weyell-brand-logo.png" [alt]="productName" class="brand-logo-full" />
          </span>
        </a>
        <button
          type="button"
          class="sidebar-close"
          aria-label="Close menu"
          (click)="closeDrawer.emit()"
        >
          <span class="material-icons-outlined">close</span>
        </button>
      </div>

      <nav class="nav-scroll" aria-label="Operations">
        @for (section of navSections(); track section.id) {
          @if (section.label) {
            <span class="nav-section">{{ section.label }}</span>
          } @else if (section.id !== 'receiving') {
            <span class="nav-divider" aria-hidden="true"></span>
          }

          @for (item of section.items; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="active"
              class="nav-item"
              [attr.title]="item.label"
              (click)="onNavClick()"
            >
              <span class="material-icons-outlined nav-icon">{{ item.icon }}</span>
              <span class="nav-label">{{ item.label }}</span>
              @if (badgeFor(item.path); as count) {
                <span class="nav-badge">{{ count }}</span>
              }
            </a>
          }
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
  `,
  styles: `
    .sidebar {
      width: var(--ops-sidebar-w);
      flex-shrink: 0;
      background: var(--ops-sidebar-bg);
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
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      flex-shrink: 0;
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

    .nav-scroll {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .nav-section {
      display: none;
      margin: 0.65rem 0.5rem 0.25rem;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: rgba(255, 255, 255, 0.45);
    }

    .nav-divider {
      display: block;
      height: 1px;
      margin: 0.35rem 0.75rem;
      background: rgba(255, 255, 255, 0.12);
      flex-shrink: 0;
    }

    .nav-item,
    .nav-logout {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.65rem 0.75rem;
      border-radius: 14px;
      color: var(--ops-sidebar-text);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      border: none;
      background: transparent;
      cursor: pointer;
      width: 100%;
      justify-content: center;
      flex-shrink: 0;
      position: relative;
    }

    .nav-label {
      display: none;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: left;
    }

    .nav-item:hover,
    .nav-logout:hover {
      background: var(--ops-sidebar-bg-hover);
      color: #fff;
    }

    .nav-item.active {
      background: var(--ops-sidebar-bg-active);
      color: var(--ops-sidebar-text-active);
      font-weight: 600;
      box-shadow: inset 3px 0 0 var(--ops-sidebar-active-border);
    }

    .nav-item.active .nav-icon {
      color: var(--ops-sidebar-text-active);
    }

    .nav-icon {
      font-size: 22px !important;
      flex-shrink: 0;
    }

    .nav-badge {
      position: absolute;
      top: 4px;
      right: 4px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      border-radius: 999px;
      background: var(--ops-danger);
      color: #fff;
      font-size: 0.6rem;
      font-weight: 700;
      line-height: 16px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .nav-logout {
      margin-top: 0.5rem;
      flex-shrink: 0;
      color: rgba(255, 255, 255, 0.45);
    }

    .sidebar-close,
    .sidebar-rail-toggle {
      display: none;
    }

    @media (min-width: 1024px) {
      .sidebar {
        transition: width 0.22s ease, padding 0.22s ease;
      }

      .sidebar.sidebar-expanded {
        width: var(--ops-sidebar-w-expanded);
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
        background: var(--ops-ink);
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

      .sidebar.sidebar-expanded .sidebar-head {
        flex-direction: column;
        align-items: stretch;
        gap: 0.5rem;
        margin-bottom: 0.85rem;
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

      .sidebar.sidebar-expanded .nav-section {
        display: block;
      }

      .sidebar.sidebar-expanded .nav-divider {
        display: none;
      }

      .sidebar.sidebar-expanded .nav-item,
      .sidebar.sidebar-expanded .nav-logout {
        flex-direction: row;
        justify-content: flex-start;
        padding: 0.7rem 0.85rem;
      }

      .sidebar.sidebar-expanded .nav-label {
        display: inline;
        font-size: 0.85rem;
      }

      .sidebar.sidebar-expanded .nav-badge {
        position: static;
        display: inline-flex;
        margin-left: auto;
      }

      /* Collapsed rail: icon + short label so items stay identifiable */
      .sidebar:not(.sidebar-expanded) .nav-item,
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

      .sidebar:not(.sidebar-expanded) .nav-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        min-width: 14px;
        height: 14px;
        font-size: 0.55rem;
        line-height: 14px;
      }
    }

    @media (max-width: 1023px) {
      .sidebar {
        position: fixed;
        left: 0;
        top: 0;
        width: var(--ops-sidebar-w-expanded);
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
        margin-bottom: 1rem;
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

      .nav-section {
        display: block;
      }

      .nav-divider {
        display: none;
      }

      .nav-item,
      .nav-logout {
        justify-content: flex-start;
        padding: 0.75rem 1rem;
      }

      .nav-label {
        display: inline;
      }

      .nav-badge {
        display: inline-flex;
        position: static;
        align-items: center;
        justify-content: center;
        margin-left: auto;
      }

      .sidebar-close {
        display: inline-flex;
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: var(--ops-radius-sm);
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        cursor: pointer;
        align-items: center;
        justify-content: center;
      }
    }
  `,
})
export class OpsSidebarComponent implements OnInit {
  private readonly receiving = inject(OpsReceivingContextService);
  private readonly session = inject(OpsSessionService);

  readonly drawerOpen = input(false);
  readonly navClick = output<void>();
  readonly closeDrawer = output<void>();

  readonly desktopExpanded = signal(readSidebarNavExpanded('ops'));

  readonly productName = PRODUCT_NAME;
  readonly productTagline = PRODUCT_TAGLINE;
  readonly routes = receivingRoutes;
  readonly exceptionCount = this.receiving.exceptionCount;

  readonly primaryNav: OpsNavItem[] = [
    {
      path: receivingRoutes.dashboard,
      label: 'Overview',
      icon: 'dashboard',
      cap: OPS_CAP.search,
      region: OPS_REGION.receiving,
      hideForRoles: ['receiver'],
    },
    {
      path: receivingRoutes.newParcel,
      label: 'Receive Parcel',
      icon: 'move_to_inbox',
      cap: OPS_CAP.intake,
      region: OPS_REGION.receiving,
    },
    {
      path: receivingRoutes.exceptions,
      label: 'Exceptions',
      icon: 'warning_amber',
      cap: OPS_CAP.search,
      region: OPS_REGION.receiving,
      hideForRoles: ['receiver'],
    },
    {
      path: receivingRoutes.readyForQuote,
      label: 'Ready for Quote',
      icon: 'request_quote',
      cap: OPS_CAP.quoteSend,
      region: OPS_REGION.receiving,
      hideForRoles: ['receiver'],
    },
  ];

  readonly warehouseNav: OpsNavItem[] = [
    {
      path: warehouseRoutes.dashboard,
      label: 'Board (Kanban)',
      icon: 'view_kanban',
      cap: OPS_CAP.warehouseRead,
      region: OPS_REGION.warehouse,
    },
    {
      path: warehouseRoutes.locations,
      label: 'Locations',
      icon: 'grid_view',
      cap: OPS_CAP.warehouseRead,
      region: OPS_REGION.warehouse,
    },
    {
      path: warehouseRoutes.movements,
      label: 'Movements',
      icon: 'swap_horiz',
      cap: OPS_CAP.warehouseRead,
      region: OPS_REGION.warehouse,
    },
    {
      path: warehouseRoutes.manifests,
      label: 'Manifests',
      icon: 'assignment',
      cap: OPS_CAP.warehouseRead,
      region: OPS_REGION.warehouse,
    },
  ];

  readonly collectionNav: OpsNavItem[] = [
    {
      path: collectionRoutes.board,
      label: 'Collection Board',
      icon: 'storefront',
      cap: OPS_CAP.collectionRead,
      region: OPS_REGION.collection,
    },
  ];

  readonly platformNav: OpsNavItem[] = [
    { path: platformRoutes.dashboard, label: 'Platform Dashboard', icon: 'analytics', region: OPS_REGION.platform },
    { path: accountRoutes.list, label: 'Accounts & Suites', icon: 'manage_accounts', region: OPS_REGION.platform },
    { path: platformRoutes.suites, label: 'Suite Configuration', icon: 'home_work', region: OPS_REGION.platform },
    { path: platformRoutes.plans, label: 'Suite Plans', icon: 'workspace_premium', region: OPS_REGION.platform },
    { path: '/ops/onboarding', label: 'Onboarding Funnel', icon: 'tune', region: OPS_REGION.platform },
    { path: '/ops/kyc', label: 'KYC Review', icon: 'verified_user', region: OPS_REGION.platform },
    { path: '/ops/shipments', label: 'Shipment Status', icon: 'local_shipping', region: OPS_REGION.platform },
    { path: '/ops/settings', label: 'Settings', icon: 'settings', region: OPS_REGION.platform, cap: OPS_CAP.teamManage },
  ];

  navSections(): OpsNavSection[] {
    const sections: OpsNavSection[] = [
      { id: 'receiving', label: 'Receiving', items: this.visiblePrimaryNav() },
    ];

    const collection = this.visibleCollectionNav();
    if (collection.length > 0) {
      sections.push({ id: 'collection', label: 'Eswatini', items: collection });
    }

    const warehouse = this.visibleWarehouseNav();
    if (warehouse.length > 0) {
      sections.push({ id: 'warehouse', label: 'Warehouse', items: warehouse });
    }

    const platform = this.visiblePlatformNav();
    if (platform.length > 0) {
      sections.push({ id: 'platform', label: 'Platform', items: platform });
    }
    return sections.filter((s) => s.items.length > 0);
  }

  homeLink(): string {
    return this.session.homePath();
  }

  visibleCollectionNav(): OpsNavItem[] {
    return this.collectionNav.filter((item) => this.isNavVisible(item));
  }

  visibleWarehouseNav(): OpsNavItem[] {
    return this.warehouseNav.filter((item) => this.isNavVisible(item));
  }

  visiblePrimaryNav(): OpsNavItem[] {
    return this.primaryNav.filter((item) => this.isNavVisible(item));
  }

  visiblePlatformNav(): OpsNavItem[] {
    return this.platformNav.filter((item) => this.isNavVisible(item));
  }

  private isNavVisible(item: OpsNavItem): boolean {
    const role = this.session.role().toLowerCase();
    if (item.hideForRoles?.includes(role)) {
      return false;
    }
    if (item.region && !this.session.hasRegion(item.region)) {
      return false;
    }
    if (item.cap && !this.session.can(item.cap)) {
      return false;
    }
    return true;
  }

  ngOnInit(): void {
    this.receiving.refreshStats();
  }

  badgeFor(path: string): number | null {
    if (path === receivingRoutes.exceptions) {
      const n = this.exceptionCount();
      return n > 0 ? n : null;
    }
    return null;
  }

  onNavClick(): void {
    this.navClick.emit();
  }

  toggleDesktopExpanded(): void {
    this.desktopExpanded.update((open) => {
      const next = !open;
      writeSidebarNavExpanded('ops', next);
      return next;
    });
  }

  signOut(): void {
    this.session.disconnect();
  }
}
