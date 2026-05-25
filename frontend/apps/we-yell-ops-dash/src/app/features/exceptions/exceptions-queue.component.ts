import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OpsPillComponent } from '../../shared/ops-pill.component';
import { OpsPaginationComponent } from '../../shared/ops-pagination.component';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsReceivingContextService } from '../../services/ops-receiving-context.service';
import { OpsOverlayService } from '../../shared/ops-overlay.service';
import { ReceivingApiService, type OpsExceptionItemDto } from '../../services/receiving-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { receivingRoutes } from '../../types/receiving.types';

@Component({
  selector: 'ops-exceptions-queue',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, OpsPillComponent, OpsPaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-head">
        <h1>Exceptions Queue</h1>
        <p>Assign, escalate, and resolve warehouse exceptions. SLA due times are based on severity.</p>
      </header>
      @if (error()) { <p class="err-banner">{{ error() }}</p> }
      @if (message()) { <p class="ok-banner">{{ message() }}</p> }
      <section class="ops-card">
        @if (items().length === 0 && !busy()) {
          <p class="pad muted">No exceptions in the queue.</p>
        } @else {
          <div class="table-wrap">
            <table class="ops-table">
              <thead>
                <tr>
                  <th>Parcel</th>
                  <th>Issue</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Assigned</th>
                  <th>SLA due</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (row of items(); track row.parcelId + row.exceptionType) {
                  <tr [class.overdue]="row.isOverdue">
                    <td>
                      <strong>{{ row.displayId }}</strong>
                      <span class="sub">{{ row.retailer }} · {{ row.customerDisplayName }}</span>
                    </td>
                    <td><ops-pill [label]="row.exceptionType" [tone]="typeTone(row.exceptionType)" /></td>
                    <td><ops-pill [label]="row.severity" [tone]="severityTone(row.severity)" /></td>
                    <td>{{ row.status }}</td>
                    <td>{{ row.assignedTo || '—' }}</td>
                    <td>
                      @if (row.dueAtUtc) {
                        <span [class.sla-warn]="row.isOverdue">{{ row.dueAtUtc | date:'MMM d, h:mm a' }}</span>
                      } @else { — }
                    </td>
                    <td class="actions">
                      <a [routerLink]="routes.parcel(row.parcelId)" class="view-link">View</a>
                      @if (canManage()) {
                        <button type="button" class="link-btn" (click)="assign(row)">Assign</button>
                        <button type="button" class="link-btn" (click)="escalate(row)">Escalate</button>
                        @if (row.status !== 'RESOLVED') {
                          <button type="button" class="link-btn resolve" (click)="resolve(row)">Resolve</button>
                        }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <ops-pagination
            [page]="page()"
            [pageSize]="pageSize()"
            [totalCount]="totalCount()"
            itemLabel="exceptions"
            ariaLabel="Exceptions queue pages"
            (prev)="prevPage()"
            (next)="nextPage()"
            (pageSizeChange)="setPageSize($event)"
          />
        }
      </section>
    </div>
  `,
  styles: `
    .page { max-width: 1280px; }
    .page-head h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    .page-head p { margin: 0 0 1rem; color: var(--ops-muted); font-size: 0.88rem; }
    .table-wrap { overflow-x: auto; }
    .ops-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    .ops-table th, .ops-table td { padding: 0.75rem 1rem; border-bottom: 1px solid var(--ops-border); text-align: left; vertical-align: top; }
    .ops-table th { background: #f8fafc; color: var(--ops-muted); font-weight: 600; }
    tr.overdue { background: #fef2f2; }
    .sub { display: block; font-size: 0.72rem; color: var(--ops-muted); margin-top: 0.15rem; }
    .sla-warn { color: #b91c1c; font-weight: 600; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.35rem 0.65rem; align-items: center; }
    .view-link, .link-btn { font-size: 0.78rem; font-weight: 600; }
    .view-link { color: var(--ops-primary); text-decoration: none; }
    .link-btn { background: none; border: none; color: var(--ops-primary); padding: 0; cursor: pointer; }
    .link-btn.resolve { color: #15803d; }
    .pad { padding: 1.25rem; }
    .muted { color: var(--ops-muted); }
    .err-banner { color: var(--ops-danger); background: var(--ops-danger-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
    .ok-banner { color: #15803d; background: var(--ops-success-soft); padding: 0.75rem 1rem; border-radius: var(--ops-radius-sm); margin-bottom: 0.85rem; }
  `,
})
export class ExceptionsQueueComponent implements OnInit {
  private readonly api = inject(ReceivingApiService);
  private readonly session = inject(OpsSessionService);
  private readonly receiving = inject(OpsReceivingContextService);
  private readonly overlay = inject(OpsOverlayService);

  readonly routes = receivingRoutes;
  readonly items = signal<OpsExceptionItemDto[]>([]);
  readonly totalCount = signal(0);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  ngOnInit(): void {
    this.reload();
  }

  canManage(): boolean {
    return this.session.can(OPS_CAP.exceptions);
  }

  assign(row: OpsExceptionItemDto): void {
    void this.openAssign(row);
  }

  escalate(row: OpsExceptionItemDto): void {
    void this.openEscalate(row);
  }

  resolve(row: OpsExceptionItemDto): void {
    void this.openResolve(row);
  }

  private async openAssign(row: OpsExceptionItemDto): Promise<void> {
    const result = await this.overlay.openPrompt({
      title: 'Assign exception',
      message: `Assign ${row.displayId} to a team member.`,
      variant: 'dialog',
      confirmLabel: 'Assign',
      fields: [
        {
          id: 'name',
          label: 'Assign to',
          defaultValue: row.assignedTo ?? this.session.actorName(),
          required: true,
          placeholder: 'Name',
        },
      ],
    });
    if (!result?.['name']?.trim()) return;
    this.runAction(() =>
      this.api.assignException(row.parcelId, row.exceptionType, result['name'].trim(), this.session.opsKey()!),
    );
  }

  private async openEscalate(row: OpsExceptionItemDto): Promise<void> {
    const result = await this.overlay.openPrompt({
      title: 'Escalate exception',
      message: `Escalate ${row.displayId} to a lead or finance reviewer.`,
      variant: 'dialog',
      confirmLabel: 'Escalate',
      fields: [
        {
          id: 'to',
          label: 'Escalate to',
          defaultValue: row.escalatedTo ?? 'Warehouse Lead',
          required: true,
        },
        {
          id: 'notes',
          label: 'Notes',
          defaultValue: row.notes ?? '',
          multiline: true,
          placeholder: 'Optional context for the escalation',
        },
      ],
    });
    if (!result?.['to']?.trim()) return;
    this.runAction(() =>
      this.api.escalateException(
        row.parcelId,
        row.exceptionType,
        result['to'].trim(),
        result['notes']?.trim() || null,
        this.session.opsKey()!,
      ),
    );
  }

  private async openResolve(row: OpsExceptionItemDto): Promise<void> {
    const result = await this.overlay.openPrompt({
      title: 'Resolve exception',
      message: `Mark ${row.displayId} as resolved.`,
      variant: 'dialog',
      confirmLabel: 'Resolve',
      fields: [
        {
          id: 'notes',
          label: 'Resolution notes',
          multiline: true,
          placeholder: 'Optional notes',
        },
      ],
    });
    if (!result) return;
    this.runAction(() =>
      this.api.resolveException(
        row.parcelId,
        row.exceptionType,
        result['notes']?.trim() || null,
        this.session.opsKey()!,
      ),
    );
  }

  private runAction(call: () => ReturnType<ReceivingApiService['assignException']>): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.error.set(null);
    call().subscribe({
      next: (r) => {
        this.overlay.success(r.message);
        this.message.set(r.message);
        this.reload();
        this.receiving.refreshStats();
      },
      error: (err) => {
        const msg = this.formatError(err);
        this.error.set(msg);
        this.overlay.error(msg);
      },
    });
  }

  private reload(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.api.listExceptions(key, this.page(), this.pageSize()).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.totalCount.set(result.totalCount);
        this.busy.set(false);
      },
      error: (err) => { this.busy.set(false); this.error.set(this.formatError(err)); },
    });
  }

  prevPage(): void {
    if (this.page() <= 1) return;
    this.page.update((p) => p - 1);
    this.reload();
  }

  nextPage(): void {
    const totalPages = Math.max(1, Math.ceil(this.totalCount() / this.pageSize()));
    if (this.page() >= totalPages) return;
    this.page.update((p) => p + 1);
    this.reload();
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    this.reload();
  }

  typeTone(type: string) {
    if (type === 'DAMAGED') return 'red' as const;
    if (type === 'MISSING_INVOICE') return 'orange' as const;
    return 'blue' as const;
  }

  severityTone(severity: string) {
    if (severity === 'HIGH' || severity === 'CRITICAL') return 'red' as const;
    if (severity === 'MEDIUM') return 'orange' as const;
    return 'gray' as const;
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string } | null;
      if (body?.detail) return body.detail;
    }
    return 'Could not load exceptions.';
  }
}
