import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export const OPS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

@Component({
  selector: 'ops-pagination',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (totalCount() > 0) {
      <nav class="pagination" [attr.aria-label]="ariaLabel()">
        <p class="pagination-meta">
          {{ rangeStart() }} to {{ rangeEnd() }} of {{ totalCount() }} {{ itemLabel() }}
        </p>
        <div class="pagination-controls">
          <label class="page-size">
            Rows per page
            <select [value]="pageSize()" (change)="onPageSizeChange($event)">
              @for (n of pageSizeOptions; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>
          </label>
          <div class="pagination-actions">
            <button
              type="button"
              class="ops-btn ops-btn-outline btn-sm"
              [disabled]="!canGoPrev()"
              (click)="prev.emit()"
              aria-label="Previous page"
            >
              <span class="material-icons-outlined">chevron_left</span>
            </button>
            <span class="pagination-pages">{{ page() }} / {{ totalPages() }}</span>
            <button
              type="button"
              class="ops-btn ops-btn-outline btn-sm"
              [disabled]="!canGoNext()"
              (click)="next.emit()"
              aria-label="Next page"
            >
              <span class="material-icons-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </nav>
    }
  `,
  styles: `
    .pagination {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      padding: 0.85rem 1rem;
      border-top: 1px solid var(--ops-border);
      background: #f8fafc;
    }
    .pagination-meta {
      margin: 0;
      font-size: 0.78rem;
      color: var(--ops-muted);
    }
    .pagination-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem 1rem;
    }
    .page-size {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      font-size: 0.78rem;
      color: var(--ops-muted);
    }
    .page-size select {
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      padding: 0.25rem 0.4rem;
      font: inherit;
      background: #fff;
    }
    .pagination-actions {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .btn-sm {
      padding: 0.25rem 0.45rem;
      min-width: 2rem;
      line-height: 1;
    }
    .btn-sm .material-icons-outlined {
      font-size: 1.1rem;
      vertical-align: middle;
    }
    .pagination-pages {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--ops-text);
      min-width: 4rem;
      text-align: center;
    }
  `,
})
export class OpsPaginationComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly totalCount = input.required<number>();
  readonly itemLabel = input('items');
  readonly ariaLabel = input('List pages');
  readonly pageSizeOptions = OPS_PAGE_SIZE_OPTIONS;

  readonly prev = output<void>();
  readonly next = output<void>();
  readonly pageSizeChange = output<number>();

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / this.pageSize())),
  );

  readonly rangeStart = computed(() => {
    if (this.totalCount() === 0) return 0;
    return (this.page() - 1) * this.pageSize() + 1;
  });

  readonly rangeEnd = computed(() =>
    Math.min(this.page() * this.pageSize(), this.totalCount()),
  );

  canGoPrev(): boolean {
    return this.page() > 1;
  }

  canGoNext(): boolean {
    return this.page() < this.totalPages();
  }

  onPageSizeChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const next = Number.parseInt(raw, 10);
    if (!Number.isNaN(next)) {
      this.pageSizeChange.emit(next);
    }
  }
}
