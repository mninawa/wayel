import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import { OpsPaginationComponent } from '../../shared/ops-pagination.component';
import { ReceivingApiService, type OpsReadyForQuoteItemDto } from '../../services/receiving-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { receivingRoutes } from '../../types/receiving.types';

@Component({
  selector: 'ops-ready-for-quote',
  standalone: true,
  imports: [RouterLink, OpsPillComponent, OpsPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1>Ready for Quote Queue</h1>
          <p>
            Parcels that passed warehouse checks. Ready items are promoted automatically and
            customers are notified via WhatsApp to request a quote.
          </p>
        </div>
      </header>
      @if (error()) { <p class="err-banner">{{ error() }}</p> }
      <section class="ops-card">
        <div class="table-wrap">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Parcel ID</th>
                <th>Customer</th>
                <th>Suite</th>
                <th>Retailer</th>
                <th>Weight</th>
                <th>Invoice</th>
                <th>Condition</th>
                <th>Readiness</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (row of items(); track row.parcelId) {
                <tr>
                  <td><strong>{{ row.displayId }}</strong></td>
                  <td>{{ row.customerDisplayName }}</td>
                  <td>{{ row.suiteNumber }}</td>
                  <td>{{ row.retailer }}</td>
                  <td>{{ row.weightKg ?? '—' }} kg</td>
                  <td><ops-pill [label]="row.invoiceStatus" tone="green" /></td>
                  <td><ops-pill [label]="row.conditionStatus" tone="green" /></td>
                  <td><ops-pill [label]="row.quoteReadiness" tone="blue" /></td>
                  <td><a [routerLink]="routes.parcel(row.parcelId)" class="view-link">View</a></td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="empty">No parcels in the quote queue.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <ops-pagination
          [page]="page()"
          [pageSize]="pageSize()"
          [totalCount]="totalCount()"
          itemLabel="parcels"
          ariaLabel="Ready for quote pages"
          (prev)="prevPage()"
          (next)="nextPage()"
          (pageSizeChange)="setPageSize($event)"
        />
      </section>
    </div>
  `,
  styles: `
    .page { max-width: 1200px; }
    .page-head { margin-bottom: 1rem; }
    .page-head h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    .page-head p { margin: 0; color: var(--ops-muted); font-size: 0.88rem; max-width: 42rem; }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    .ops-table .empty { color: var(--ops-muted); text-align: center; padding: 1.25rem; }
    .view-link { color: var(--ops-primary); font-weight: 600; text-decoration: none; }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class ReadyForQuoteComponent implements OnInit {
  private readonly api = inject(ReceivingApiService);
  private readonly session = inject(OpsSessionService);
  readonly routes = receivingRoutes;
  readonly items = signal<OpsReadyForQuoteItemDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly error = signal<string | null>(null);

  ngOnInit(): void { this.refresh(); }

  refresh(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.api.listReadyForQuote(key, this.page(), this.pageSize()).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.totalCount.set(result.totalCount);
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.refresh();
  }

  nextPage(): void {
    const totalPages = Math.max(1, Math.ceil(this.totalCount() / this.pageSize()));
    if (this.page() >= totalPages) return;
    this.page.update((p) => p + 1);
    this.refresh();
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.refresh();
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string } | null;
      if (body?.detail) return body.detail;
    }
    return 'Could not load the quote queue.';
  }
}
