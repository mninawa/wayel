import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '../brand';
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

@Component({
  selector: 'ops-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="sidebar" [class.collapsed]="collapsed()">
      <a [routerLink]="routes.dashboard" class="sidebar-brand">
        <span class="brand-wordmark" [class.collapsed]="collapsed()">{{ productName }}</span>
        @if (!collapsed()) {
          <span class="brand-module">{{ productTagline }}</span>
        }
      </a>

      <nav class="sidebar-nav" aria-label="Parcel receiving">
        @for (item of visiblePrimaryNav(); track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" class="nav-item">
            <span class="material-icons-outlined">{{ item.icon }}</span>
            @if (!collapsed()) {
              <span class="nav-label">{{ item.label }}</span>
              @if (badgeFor(item.path); as count) {
                <span class="nav-badge">{{ count }}</span>
              }
            }
          </a>
        }

        @if (visibleCollectionNav().length > 0) {
          @if (!collapsed()) {
            <span class="nav-section">Eswatini</span>
          }
          @for (item of visibleCollectionNav(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" class="nav-item">
              <span class="material-icons-outlined">{{ item.icon }}</span>
              @if (!collapsed()) {
                <span class="nav-label">{{ item.label }}</span>
              }
            </a>
          }
        }

        @if (visibleWarehouseNav().length > 0) {
          @if (!collapsed()) {
            <span class="nav-section">Warehouse</span>
          }
          @for (item of visibleWarehouseNav(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" class="nav-item">
              <span class="material-icons-outlined">{{ item.icon }}</span>
              @if (!collapsed()) {
                <span class="nav-label">{{ item.label }}</span>
              }
            </a>
          }
        }

        @if (!collapsed()) {
          <span class="nav-section">Platform</span>
        }
        @for (item of platformNav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" class="nav-item">
            <span class="material-icons-outlined">{{ item.icon }}</span>
            @if (!collapsed()) {
              <span class="nav-label">{{ item.label }}</span>
            }
          </a>
        }
      </nav>

      <button type="button" class="collapse-btn" (click)="collapsed.set(!collapsed())">
        <span class="material-icons-outlined">{{ collapsed() ? 'chevron_right' : 'chevron_left' }}</span>
        @if (!collapsed()) { <span>Collapse</span> }
      </button>
    </aside>
  `,
  styles: `
    .sidebar { width: 248px; background: var(--ops-navy); color: #fff; display: flex; flex-direction: column; min-height: 100%; flex-shrink: 0; transition: width 0.2s ease; }
    .sidebar.collapsed { width: 64px; }
    .sidebar-brand {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1.15rem 1rem 1rem;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      text-decoration: none;
    }
    .brand-wordmark {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.1;
      color: var(--ops-brand-purple);
    }
    .brand-wordmark.collapsed {
      font-size: 0.72rem;
      text-align: center;
      width: 100%;
    }
    .brand-module { font-size: 0.68rem; color: rgba(255,255,255,0.58); line-height: 1.4; font-weight: 500; }
    .sidebar-nav { flex: 1; padding: 0.75rem 0.55rem; display: flex; flex-direction: column; gap: 0.15rem; overflow-y: auto; }
    .nav-section { margin: 0.85rem 0.5rem 0.35rem; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.45); }
    .nav-item { display: flex; align-items: center; gap: 0.55rem; padding: 0.55rem 0.65rem; border-radius: var(--ops-radius-sm); color: rgba(255,255,255,0.78); text-decoration: none; font-size: 0.84rem; font-weight: 600; }
    .nav-item:hover, .nav-item.active { background: rgba(255,255,255,0.1); color: #fff; }
    .nav-item.active { box-shadow: inset 3px 0 0 var(--ops-brand-green); }
    .nav-label { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .nav-badge { background: #ef4444; color: #fff; font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.4rem; border-radius: 999px; }
    .collapse-btn { display: flex; align-items: center; gap: 0.4rem; margin: 0.75rem; padding: 0.45rem 0.65rem; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); border-radius: var(--ops-radius-sm); color: rgba(255,255,255,0.75); font-size: 0.78rem; font-weight: 600; }
    .sidebar.collapsed .nav-item { justify-content: center; padding: 0.55rem; }
    .sidebar.collapsed .collapse-btn { justify-content: center; }
    .sidebar.collapsed .sidebar-brand { padding: 0.75rem 0.5rem; align-items: center; }
  `,
})
export class OpsSidebarComponent implements OnInit {
  private readonly receiving = inject(OpsReceivingContextService);
  private readonly session = inject(OpsSessionService);

  readonly productName = PRODUCT_NAME;
  readonly productTagline = PRODUCT_TAGLINE;
  readonly routes = receivingRoutes;
  readonly collapsed = signal(false);
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

  readonly platformNav: OpsNavItem[] = [
    { path: platformRoutes.dashboard, label: 'Platform Dashboard', icon: 'dashboard' },
    { path: accountRoutes.list, label: 'Accounts & Suites', icon: 'manage_accounts' },
    { path: platformRoutes.suites, label: 'Suite Configuration', icon: 'home_work' },
    { path: platformRoutes.plans, label: 'Suite Plans', icon: 'workspace_premium' },
    { path: platformRoutes.pricing, label: 'Pricing Configuration', icon: 'price_change' },
    { path: '/ops/kyc', label: 'KYC Review', icon: 'verified_user' },
    { path: '/ops/shipments', label: 'Shipment Status', icon: 'local_shipping' },
    { path: '/ops/settings', label: 'Settings', icon: 'settings' },
  ];
}
