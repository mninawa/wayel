import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReceivingApiService, type OpsParcelDetailDto, type SuiteReceiveLookupDto } from '../../services/receiving-api.service';
import { OpsReceivingContextService } from '../../services/ops-receiving-context.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { receivingRoutes } from '../../types/receiving.types';

@Component({
  selector: 'ops-parcel-matching',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a [routerLink]="routes.parcel(parcelId())" class="back-link">← Back to parcel</a>
      <h1>Parcel Matching</h1>
      @if (parcel(); as p) {
        <p class="sub">Confirm customer-suite match for {{ p.displayId }}</p>
        <section class="ops-card ops-card-pad">
          <p><strong>Tracking:</strong> {{ p.trackingNumber || '—' }}</p>
          <p><strong>Current suite:</strong> {{ p.suiteNumber || 'Unmatched' }}</p>
          <label><span>Suite number to confirm</span>
            <input [(ngModel)]="suiteNumber" name="suite" (blur)="lookupSuite()" />
          </label>
          @if (suiteLookup(); as l) {
            <div class="match-card">
              <strong>{{ l.customerDisplayName }}</strong>
              <span>{{ l.customerEmail }}</span>
              <span>Suite {{ l.suiteNumber }} · {{ l.suiteAccessStatus }}</span>
              @if (!l.canReceiveParcels) { <p class="warn">{{ l.customerMessage }}</p> }
            </div>
          }
          @if (error()) { <p class="err">{{ error() }}</p> }
          @if (success()) { <p class="ok">{{ success() }}</p> }
          <div class="actions">
            <button
              type="button"
              class="ops-btn ops-btn-primary"
              [disabled]="!suiteLookup()?.canReceiveParcels || saving()"
              (click)="confirmMatch()"
            >
              {{ saving() ? 'Saving…' : 'Confirm suite match' }}
            </button>
            <a [routerLink]="routes.parcel(parcelId())" class="ops-btn ops-btn-outline">Back to parcel</a>
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .page { max-width: 640px; }
    .back-link { color: var(--ops-link); text-decoration: none; font-weight: 600; font-size: 0.85rem; }
    h1 { margin: 0.75rem 0 0.25rem; font-size: 1.25rem; }
    .sub { color: var(--ops-muted); margin: 0 0 1rem; }
    label { display: flex; flex-direction: column; gap: 0.3rem; margin: 1rem 0; font-size: 0.85rem; }
    label input { padding: 0.55rem 0.75rem; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); }
    .match-card { background: var(--ops-success-soft); border: 1px solid #86efac; border-radius: var(--ops-radius-sm); padding: 0.75rem; margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.85rem; }
    .warn { color: #991b1b; margin: 0.35rem 0 0; }
    .err { color: #b91c1c; }
    .ok { color: #166534; background: var(--ops-success-soft); padding: 0.5rem 0.75rem; border-radius: var(--ops-radius-sm); }
    .actions { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; }
  `,
})
export class ParcelMatchingComponent implements OnInit {
  readonly parcelId = input.required<string>();
  readonly routes = receivingRoutes;

  private readonly api = inject(ReceivingApiService);
  private readonly session = inject(OpsSessionService);
  private readonly receiving = inject(OpsReceivingContextService);

  readonly parcel = signal<OpsParcelDetailDto | null>(null);
  readonly suiteLookup = signal<SuiteReceiveLookupDto | null>(null);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly saving = signal(false);
  suiteNumber = '';

  ngOnInit(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.api.getParcel(this.parcelId(), key).subscribe({
      next: (p) => { this.parcel.set(p); this.suiteNumber = p.suiteNumber; },
    });
  }

  lookupSuite(): void {
    const key = this.session.opsKey();
    if (!key || !this.suiteNumber.trim()) return;
    this.error.set(null);
    this.success.set(null);
    this.api.lookupSuite(this.suiteNumber, key).subscribe({
      next: (l) => this.suiteLookup.set(l),
      error: (err) => this.error.set(this.formatError(err)),
    });
  }

  confirmMatch(): void {
    const key = this.session.opsKey();
    if (!key || !this.suiteNumber.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
    this.api.confirmSuiteMatch(this.parcelId(), this.suiteNumber, key).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.success.set(res.message);
        this.receiving.refreshStats();
        this.api.getParcel(this.parcelId(), key).subscribe({ next: (p) => this.parcel.set(p) });
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(this.formatError(err));
      },
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string } | null;
      if (body?.detail) return body.detail;
    }
    return 'Suite lookup failed.';
  }
}
