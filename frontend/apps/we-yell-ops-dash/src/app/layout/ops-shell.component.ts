import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { OpsConnectComponent } from './ops-connect.component';
import { OpsSidebarComponent } from './ops-sidebar.component';
import { OpsTopbarComponent } from './ops-topbar.component';
import { OpsReceivingContextService } from '../services/ops-receiving-context.service';
import { OpsSessionService } from '../services/ops-session.service';
import { OpsOverlayHostComponent } from '../shared/ops-overlay-host.component';
import { COLLECTION_BASE } from '../types/collection.types';
import { WAREHOUSE_BASE } from '../types/warehouse.types';

@Component({
  selector: 'ops-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    OpsConnectComponent,
    OpsSidebarComponent,
    OpsTopbarComponent,
    OpsOverlayHostComponent,
  ],
  template: `
    <ops-overlay-host />
    @if (!session.isConnected()) {
      <ops-connect />
    } @else {
      <div class="ops-shell" [class.ops-shell-nav-open]="sidebarOpen()">
        @if (sidebarOpen()) {
          <button
            type="button"
            class="sidebar-backdrop"
            aria-label="Close navigation menu"
            (click)="closeSidebar()"
          ></button>
        }

        <ops-sidebar
          [drawerOpen]="sidebarOpen()"
          (navClick)="closeSidebar()"
          (closeDrawer)="closeSidebar()"
        />

        <div class="ops-workspace">
          <ops-topbar
            [menuExpanded]="sidebarOpen()"
            (menuClick)="toggleSidebar()"
          />
          <main class="ops-content" [class.ops-content-board]="boardLayout()">
            <router-outlet />
          </main>
        </div>
      </div>
    }
  `,
  styles: `
    .ops-shell {
      display: flex;
      min-height: 100vh;
      background: var(--ops-bg);
    }

    .ops-workspace {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .ops-content {
      flex: 1;
      overflow-y: auto;
      padding: var(--ops-content-pad-y) var(--ops-content-pad-x) 2.5rem;
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .ops-content.ops-content-board {
      padding: 0;
      overflow: hidden;
    }

    .sidebar-backdrop {
      display: none;
    }

    @media (max-width: 1023px) {
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
    }
  `,
})
export class OpsShellComponent {
  private readonly receiving = inject(OpsReceivingContextService);
  private readonly router = inject(Router);
  readonly session = inject(OpsSessionService);

  readonly sidebarOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly boardLayout = computed(() => {
    const url = this.url() ?? '';
    return url === WAREHOUSE_BASE || url === COLLECTION_BASE;
  });

  constructor() {
    effect(() => {
      if (this.session.isConnected()) {
        untracked(() => {
          this.session.refreshAccess().subscribe();
          this.receiving.refreshStats();
        });
      }
    });

    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.closeSidebar());
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
    this.syncBodyScrollLock();
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
    this.syncBodyScrollLock();
  }

  private syncBodyScrollLock(): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.style.overflow = this.sidebarOpen() ? 'hidden' : '';
  }
}
