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

    <nav class="bb-pill-tabs" aria-label="Quotes sections">
      <a
        routerLink="/quotes/list"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
      >
        <span class="material-icons-outlined">format_list_bulleted</span>
        Your quotes
      </a>
      <a
        routerLink="/quotes/request"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
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
    .bb-pill-tabs {
      margin-bottom: 1.15rem;
      flex-wrap: wrap;
    }
    .bb-pill-tabs .material-icons-outlined { font-size: 18px !important; }
    .hub-outlet { min-height: 200px; }
  `,
})
export class QuotesHubComponent {}
