import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  invoiceUploadRoute,
  parcelsNeedingInvoiceUpload,
  primaryInvoiceUploadParcel,
} from '../../models/parcel.models';
import { ParcelsService } from '../../services/parcels.service';

@Component({
  selector: 'app-pending-invoice-banner',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (count() > 0 && uploadRoute(); as route) {
      <section class="invoice-alert bb-card" role="alert" aria-live="polite">
        <span class="material-icons-outlined alert-icon">upload_file</span>
        <div class="alert-copy">
          <strong>
            {{ count() }} parcel{{ count() === 1 ? '' : 's' }}
            {{ count() === 1 ? 'needs' : 'need' }} your invoice
          </strong>
          @if (primaryParcel(); as parcel) {
            <p>
              <strong class="parcel-name">{{ parcel.itemName }}</strong>
              @if (parcel.trackingNumber) {
                <span class="parcel-meta"> · {{ parcel.trackingNumber }}</span>
              }
              — upload the retailer invoice (PDF or photo) so we can prepare your shipping quote.
            </p>
          } @else {
            <p>Upload the retailer invoice (PDF or image) before you can request a quote or ship out.</p>
          }
        </div>
        <div class="alert-actions">
          <a [routerLink]="route" class="bb-btn bb-btn-primary">Upload invoice →</a>
          @if (count() > 1) {
            <a routerLink="/received-parcels" [queryParams]="{ invoice: 'pending' }" class="bb-link">
              View all pending
            </a>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .invoice-alert {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1rem 1.15rem;
      margin-bottom: 1.25rem;
      border-color: #fcd34d;
      background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
      box-shadow: 0 4px 20px rgba(245, 158, 11, 0.12);
    }
    .invoice-alert .alert-icon {
      color: #b45309;
      font-size: 28px;
      flex-shrink: 0;
    }
    .invoice-alert .alert-copy {
      flex: 1;
      min-width: 0;
    }
    .invoice-alert .alert-copy strong {
      display: block;
      font-size: 0.95rem;
      color: #92400e;
      margin-bottom: 0.25rem;
    }
    .invoice-alert .alert-copy p {
      margin: 0;
      font-size: 0.82rem;
      color: #78350f;
      line-height: 1.45;
    }
    .parcel-name { font-weight: 700; color: #92400e; }
    .parcel-meta { font-weight: 500; color: #a16207; }
    .alert-actions {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
      flex-shrink: 0;
    }
    .alert-actions .bb-link {
      font-size: 0.78rem;
      text-align: center;
      white-space: nowrap;
    }
    @media (max-width: 768px) {
      .invoice-alert {
        flex-direction: column;
        align-items: stretch;
      }
      .alert-actions .bb-btn { width: 100%; justify-content: center; }
    }
  `,
})
export class PendingInvoiceBannerComponent {
  private readonly parcelsApi = inject(ParcelsService);

  readonly count = computed(() => parcelsNeedingInvoiceUpload(this.parcelsApi.parcels()).length);

  readonly primaryParcel = computed(() => primaryInvoiceUploadParcel(this.parcelsApi.parcels()));

  readonly uploadRoute = computed(() => invoiceUploadRoute(this.parcelsApi.parcels()));
}
