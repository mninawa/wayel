import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  input,
  inject,
  output,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PRODUCT_NAME } from '../brand';
import { OPS_CAP } from '../services/ops-permissions';
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
    <aside class="sidebar" [class.sidebar-open]="drawerOpen()">
      <div class="sidebar-head">
        <a
          [routerLink]="routes.dashboard"
          class="brand-mark"
          [attr.title]="productName"
          (click)="onNavClick()"
        >
          <span class="material-icons-outlined brand-icon">warehouse</span>
          <span class="brand-wordmark">{{ productName }}</span>
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
      color: var(--ops-lime);
    }

    .brand-wordmark {
      display: none;
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #fff;
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
      font-weight: 700;
    }

    .nav-item.active .nav-icon {
      color: var(--ops-ink);
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

    .sidebar-close {
      display: none;
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

      .brand-wordmark {
        display: block;
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

  readonly productName = PRODUCT_NAME;
  readonly routes = receivingRoutes;
  readonly exceptionCount = this.receiving.exceptionCount;

  readonly primaryNav: OpsNavItem[] = [
    { path: receivingRoutes.dashboard, label: 'Overview', icon: 'dashboard', cap: OPS_CAP.search },
    { path: receivingRoutes.newParcel, label: 'Receive Parcel', icon: 'move_to_inbox', cap: OPS_CAP.intake },
    { path: receivingRoutes.exceptions, label: 'Exceptions', icon: 'warning_amber', cap: OPS_CAP.search },
    { path: receivingRoutes.readyForQuote, label: 'Ready for Quote', icon: 'request_quote', cap: OPS_CAP.quoteSend },
  ];

  readonly warehouseNav: OpsNavItem[] = [
    { path: warehouseRoutes.dashboard, label: 'Board (Kanban)', icon: 'view_kanban', cap: OPS_CAP.warehouseRead },
    { path: warehouseRoutes.locations, label: 'Locations', icon: 'grid_view', cap: OPS_CAP.warehouseRead },
    { path: warehouseRoutes.movements, label: 'Movements', icon: 'swap_horiz', cap: OPS_CAP.warehouseRead },
    { path: warehouseRoutes.manifests, label: 'Manifests', icon: 'assignment', cap: OPS_CAP.warehouseRead },
  ];

  readonly collectionNav: OpsNavItem[] = [
    { path: collectionRoutes.board, label: 'Collection Board', icon: 'storefront', cap: OPS_CAP.warehouseRead },
  ];

  readonly platformNav: OpsNavItem[] = [
    { path: platformRoutes.dashboard, label: 'Platform Dashboard', icon: 'analytics' },
    { path: accountRoutes.list, label: 'Accounts & Suites', icon: 'manage_accounts' },
    { path: platformRoutes.suites, label: 'Suite Configuration', icon: 'home_work' },
    { path: platformRoutes.plans, label: 'Suite Plans', icon: 'workspace_premium' },
    { path: '/ops/onboarding', label: 'Onboarding Funnel', icon: 'tune' },
    { path: '/ops/kyc', label: 'KYC Review', icon: 'verified_user' },
    { path: '/ops/shipments', label: 'Shipment Status', icon: 'local_shipping' },
    { path: '/ops/settings', label: 'Settings', icon: 'settings' },
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

    sections.push({ id: 'platform', label: 'Platform', items: this.platformNav });
    return sections.filter((s) => s.items.length > 0);
  }

  visibleCollectionNav(): OpsNavItem[] {
    return this.collectionNav.filter((item) => !item.cap || this.session.can(item.cap));
  }

  visibleWarehouseNav(): OpsNavItem[] {
    return this.warehouseNav.filter((item) => !item.cap || this.session.can(item.cap));
  }

  visiblePrimaryNav(): OpsNavItem[] {
    return this.primaryNav.filter((item) => !item.cap || this.session.can(item.cap));
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

  signOut(): void {
    this.session.disconnect();
  }
}
