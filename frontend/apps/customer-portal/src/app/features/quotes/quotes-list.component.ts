import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { QuoteSummaryDto } from '../../services/borderbox-api.service';
import { BorderboxApiService } from '../../services/borderbox-api.service';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

@Component({
  selector: 'app-quotes-list',
  standalone: true,
  imports: [RouterLink, DecimalPipe, DatePipe, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <nk-pulse-loader label="Loading quotes…" />
    } @else if (loadError()) {
      <p class="err">{{ loadError() }}</p>
    } @else if (quotes().length === 0) {
      <section class="bb-card bb-card-pad empty">
        <p>No quotes yet. Select parcels and request a quote to see landed costs.</p>
        <a routerLink="/quotes/request" class="bb-btn bb-btn-primary">Request your first quote</a>
      </section>
    } @else {
      <section class="bb-card table-card">
        <table class="bb-table">
          <thead>
            <tr>
              <th>Quote</th>
              <th>Status</th>
              <th>Parcels</th>
              <th>Delivery</th>
              <th>Valid until</th>
              <th>Total</th>
              <th>Invoice</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (q of quotes(); track q.id) {
              <tr>
                <td><strong>{{ q.displayNumber }}</strong></td>
                <td>
                  <span class="bb-pill" [class]="statusClass(q)">{{ q.statusLabel }}</span>
                  @if (q.shipOutLocked) {
                    <span class="row-hint">Suite renewal required</span>
                  }
                </td>
                <td>{{ q.parcelCount }}</td>
                <td>{{ q.deliveryMethod }}</td>
                <td>{{ q.validUntil | date:'d MMM y, HH:mm' }}</td>
                <td>R{{ q.totalLandedCost | number:'1.2-2' }}</td>
                <td>
                  @if (q.hasPaymentInvoice) {
                    <a
                      [href]="invoiceUrl(q.id)"
                      target="_blank"
                      rel="noopener"
                      class="bb-link"
                    >View</a>
                  } @else {
                    <span class="muted-cell">—</span>
                  }
                </td>
                <td><a [routerLink]="['/quotes', q.id]" class="bb-link">View</a></td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }
  `,
  styles: `
    .empty { text-align: center; }
    .empty p { color: var(--bb-muted); margin-bottom: 1rem; }
    .row-hint { display: block; font-size: 0.72rem; color: var(--bb-muted); margin-top: 0.2rem; }
    .err { color: var(--bb-danger); }
    .pill-approved { background: var(--bb-success-soft); color: #15803d; }
    .pill-blocked { background: #fef2f2; color: var(--bb-danger); }
    .pill-pending { background: var(--bb-primary-soft); color: var(--bb-ink); }
    .pill-muted { background: #f1f5f9; color: var(--bb-muted); }
    .muted-cell { color: var(--bb-muted); font-size: 0.85rem; }
  `,
})
export class QuotesListComponent implements OnInit {
  private readonly api = inject(BorderboxApiService);

  invoiceUrl(quoteId: string): string {
    return this.api.quotePaymentInvoiceDownloadUrl(quoteId);
  }

  readonly quotes = signal<QuoteSummaryDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    this.loading.set(true);
    this.api.listQuotes().subscribe({
      next: (items) => {
        this.quotes.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Could not load quotes.');
        this.loading.set(false);
      },
    });
  }

  statusClass(q: QuoteSummaryDto): string {
    const s = q.status.toLowerCase();
    if (s.includes('approved') || s.includes('paid')) return 'bb-pill pill-approved';
    if (s.includes('blocked') || s.includes('expired')) return 'bb-pill pill-blocked';
    if (s.includes('pending') || s.includes('draft') || s.includes('review')) return 'bb-pill pill-pending';
    return 'bb-pill pill-muted';
  }
}
