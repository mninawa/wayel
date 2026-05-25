import { Component, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OpsConnectComponent } from './ops-connect.component';
import { OpsSidebarComponent } from './ops-sidebar.component';
import { OpsTopbarComponent } from './ops-topbar.component';
import { OpsReceivingContextService } from '../services/ops-receiving-context.service';
import { OpsSessionService } from '../services/ops-session.service';
import { OpsOverlayHostComponent } from '../shared/ops-overlay-host.component';
@Component({
  selector: 'ops-shell',
  standalone: true,
  imports: [RouterOutlet, OpsConnectComponent, OpsSidebarComponent, OpsTopbarComponent, OpsOverlayHostComponent],
  template: `
    <ops-overlay-host />
    @if (!session.isConnected()) {
      <ops-connect />
    } @else {
      <div class="ops-app">
        <ops-sidebar />
        <div class="ops-workspace">
          <ops-topbar />
          <main class="ops-main">
            <router-outlet />
          </main>
        </div>
      </div>
    }
  `,
  styles: `
    .ops-app { min-height: 100vh; display: flex; }
    .ops-workspace { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--ops-bg); }
    .ops-main { flex: 1; padding: 1.25rem 1.25rem 2.5rem; min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  `,
})
export class OpsShellComponent {
  private readonly receiving = inject(OpsReceivingContextService);
  readonly session = inject(OpsSessionService);

  constructor() {
    effect(() => {
      if (this.session.isConnected()) {
        untracked(() => {
          this.session.refreshAccess().subscribe();
          this.receiving.refreshStats();
        });
      }
    });
  }
}
