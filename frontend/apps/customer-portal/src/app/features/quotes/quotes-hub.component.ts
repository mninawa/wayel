import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-quotes-hub',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SuiteExpiredBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bb-page-head hub-head">
      <h1>Quotes &amp; ship-out</h1>
      <p>Request landed-cost quotes for your parcels, review totals, and pay to ship to Eswatini.</p>
    </div>

    <app-suite-expired-banner />

    <nav class="tabs" aria-label="Quotes sections">
      <a
        routerLink="/quotes/list"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        class="tab"
      >
        <span class="material-icons-outlined">format_list_bulleted</span>
        Your quotes
      </a>
      <a
        routerLink="/quotes/request"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        class="tab"
      >
        <span class="material-icons-outlined">add_circle_outline</span>
        Request quote
      </a>
    </nav>

    <div class="hub-outlet">
      <router-outlet />
    </div>
  `,
  styles: `
    .hub-head { margin-bottom: 0.75rem; }
    .tabs {
      display: flex;
      gap: 0.35rem;
      margin-bottom: 1.15rem;
      padding: 0.25rem;
      background: #f1f5f9;
      border-radius: var(--bb-radius-sm);
      width: fit-content;
      max-width: 100%;
      flex-wrap: wrap;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.55rem 1rem;
      border-radius: var(--bb-radius-sm);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--bb-muted);
      text-decoration: none;
      transition: background 0.15s, color 0.15s;
    }
    .tab .material-icons-outlined { font-size: 18px !important; }
    .tab:hover { color: var(--bb-text); background: rgba(255, 255, 255, 0.6); }
    .tab.active {
      background: #fff;
      color: var(--bb-primary);
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
    }
    .hub-outlet { min-height: 200px; }
  `,
})
export class QuotesHubComponent {}
