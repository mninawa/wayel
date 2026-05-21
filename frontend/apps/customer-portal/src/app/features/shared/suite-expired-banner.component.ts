import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  MOCK_SUITE,
  SUITE_EXPIRED_MESSAGE,
} from '../../data/borderbox-mock.data';

@Component({
  selector: 'app-suite-expired-banner',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bb-alert" role="alert">
      <span class="material-icons-outlined">warning</span>
      <div>
        <strong>Suite Access Expired</strong>
        <p>{{ message }}</p>
      </div>
      <div class="bb-alert-actions">
        <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-outline bb-btn-outline-sm">
          {{ monthly.label }}
        </a>
        <a routerLink="/suite-access/checkout" class="bb-btn bb-btn-primary bb-btn-outline-sm">
          {{ quarterly.label }}
        </a>
      </div>
    </div>
  `,
})
export class SuiteExpiredBannerComponent {
  readonly message = SUITE_EXPIRED_MESSAGE;
  readonly monthly = MOCK_SUITE.renewMonthly;
  readonly quarterly = MOCK_SUITE.renewQuarterly;
}
