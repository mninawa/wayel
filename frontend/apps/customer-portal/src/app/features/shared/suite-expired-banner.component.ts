import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ParcelsService } from '../../services/parcels.service';

@Component({
  selector: 'app-suite-expired-banner',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (show()) {
      <div class="bb-alert" role="alert">
        <span class="material-icons-outlined">warning</span>
        <div>
          <strong>Suite Access Expired</strong>
          <p>{{ message() }}</p>
        </div>
        <div class="bb-alert-actions">
          <a routerLink="/suite-access/checkout" [queryParams]="{ plan: 'monthly' }" class="bb-btn bb-btn-outline bb-btn-outline-sm">
            Renew R100 / month
          </a>
          <a routerLink="/suite-access/checkout" [queryParams]="{ plan: 'quarterly' }" class="bb-btn bb-btn-primary bb-btn-outline-sm">
            Renew R200 / quarter
          </a>
        </div>
      </div>
    }
  `,
})
export class SuiteExpiredBannerComponent {
  private readonly parcelsApi = inject(ParcelsService);

  readonly show = computed(() => {
    const access = this.parcelsApi.dashboard()?.suiteAccess;
    return access?.shipOutLocked === true || access?.status === 'Expired';
  });

  readonly message = computed(
    () =>
      this.parcelsApi.dashboard()?.suiteAccess.customerMessage ??
      'Your suite is reserved but ship-out is locked until you renew.',
  );
}
