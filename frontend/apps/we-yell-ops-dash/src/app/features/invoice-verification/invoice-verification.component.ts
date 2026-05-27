import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { OpsPillComponent, pillToneForInvoice } from '../../shared/ops-pill.component';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsOverlayService } from '../../shared/ops-overlay.service';
import { ReceivingApiService, type OpsParcelDetailDto } from '../../services/receiving-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { receivingRoutes } from '../../types/receiving.types';

@Component({
  selector: 'ops-invoice-verification',
  standalone: true,
  imports: [RouterLink, OpsPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a [routerLink]="routes.parcel(parcelId())" class="back-link">← Back to parcel</a>
      <h1>Invoice Verification</h1>
      @if (parcel(); as p) {
        <p class="sub">{{ p.displayId }} · {{ p.itemName }} · <ops-pill [label]="p.invoiceStatus" [tone]="invoiceTone(p.invoiceStatus)" /></p>
        <div class="layout">
          <section class="ops-card ops-card-pad">
            <h2 class="ops-card-title">Invoice document</h2>
            @if (!p.invoiceFileName) {
              <p class="hint">Customer has not uploaded an invoice yet.</p>
            } @else if (previewUrl()) {
              @if (isPdf()) {
                <iframe class="doc-frame" [src]="previewUrl()" title="Invoice PDF"></iframe>
              } @else {
                <img class="doc-img" [src]="previewUrl()!" alt="Invoice" />
              }
            } @else if (previewError()) {
              <p class="err">{{ previewError() }}</p>
            } @else {
              <p class="hint">Loading invoice…</p>
            }
          </section>
          <section class="ops-card ops-card-pad">
            <h2 class="ops-card-title">Verification</h2>
            <dl class="meta">
              <div><dt>File</dt><dd>{{ p.invoiceFileName || '—' }}</dd></div>
              <div><dt>Declared value</dt><dd>{{ p.declaredValueZar != null ? 'R ' + p.declaredValueZar : '—' }}</dd></div>
              <div><dt>Quote readiness</dt><dd>{{ p.quoteReadiness }}</dd></div>
            </dl>
            @if (p.readinessBlockers?.length) {
              <p class="hint">Blockers: {{ p.readinessBlockers.join(', ') }}</p>
            }
            @if (message()) { <p class="ok">{{ message() }}</p> }
            @if (error()) { <p class="err">{{ error() }}</p> }
            @if (canVerify()) {
              <div class="actions">
                <button type="button" class="ops-btn ops-btn-primary" [disabled]="busy() || !p.invoiceFileName" (click)="approve()">Approve invoice</button>
                <button type="button" class="ops-btn ops-btn-ghost danger" [disabled]="busy() || !p.invoiceFileName" (click)="reject()">Reject invoice</button>
              </div>
            } @else {
              <p class="hint">Your role can view invoices but not approve or reject.</p>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .page { max-width: 1100px; }
    .back-link { color: var(--ops-link); text-decoration: none; font-weight: 600; font-size: 0.85rem; }
    h1 { margin: 0.75rem 0 0.25rem; font-size: 1.25rem; }
    .sub { color: var(--ops-muted); margin: 0 0 1rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .layout { display: grid; grid-template-columns: 1.2fr 1fr; gap: 1rem; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
    .doc-frame { width: 100%; min-height: 520px; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); }
    .doc-img { max-width: 100%; border-radius: var(--ops-radius-sm); border: 1px solid var(--ops-border); }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem; margin: 0 0 1rem; font-size: 0.85rem; }
    .meta dt { color: var(--ops-muted); font-weight: 600; }
    .meta dd { margin: 0; }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .danger { color: #b91c1c; border-color: #fecaca; }
    .hint { font-size: 0.82rem; color: var(--ops-muted); }
    .ok { background: var(--ops-success-soft); color: #15803d; padding: 0.65rem; border-radius: var(--ops-radius-sm); }
    .err { color: #b91c1c; }
  `,
})
export class InvoiceVerificationComponent implements OnInit, OnDestroy {
  readonly parcelId = input.required<string>();
  readonly routes = receivingRoutes;
  readonly invoiceTone = pillToneForInvoice;

  private readonly api = inject(ReceivingApiService);
  private readonly session = inject(OpsSessionService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly overlay = inject(OpsOverlayService);

  readonly parcel = signal<OpsParcelDetailDto | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewError = signal<string | null>(null);
  readonly contentType = signal('');

  private objectUrl: string | null = null;

  ngOnInit(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.api.getParcel(this.parcelId(), key).subscribe({
      next: (p) => {
        this.parcel.set(p);
        if (p.invoiceFileName) this.loadPreview(key);
      },
    });
  }

  ngOnDestroy(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }

  canVerify(): boolean {
    return this.session.can(OPS_CAP.invoiceVerify);
  }

  isPdf(): boolean {
    return this.contentType().includes('pdf');
  }

  approve(): void { void this.verify('APPROVE'); }
  reject(): void { void this.verify('REJECT'); }

  private loadPreview(key: string): void {
    this.api.downloadInvoiceBlob(this.parcelId(), key).subscribe({
      next: (blob) => {
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.contentType.set(blob.type);
        this.objectUrl = URL.createObjectURL(blob);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
      },
      error: () => this.previewError.set('Could not load invoice file.'),
    });
  }

  private async verify(decision: 'APPROVE' | 'REJECT'): Promise<void> {
    const key = this.session.opsKey();
    if (!key) return;
    let reason: string | undefined;
    if (decision === 'REJECT') {
      const prompted = await this.overlay.requestInvoiceRejectionReason();
      if (!prompted) return;
      reason = prompted;
    }
    this.busy.set(true);
    this.error.set(null);
    this.api.verifyInvoice(this.parcelId(), { decision, reason }, key).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.message.set(r.message);
        this.overlay.success(r.message);
        this.api.getParcel(this.parcelId(), key).subscribe({ next: (p) => this.parcel.set(p) });
      },
      error: (err) => {
        this.busy.set(false);
        const msg = this.formatError(err);
        this.error.set(msg);
        this.overlay.error(msg);
      },
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | null;
      if (body?.detail) return body.detail;
      if (body?.title) return body.title;
      if (err.status === 0) return 'Network error — could not reach the API.';
    }
    return 'Invoice action failed.';
  }
}
