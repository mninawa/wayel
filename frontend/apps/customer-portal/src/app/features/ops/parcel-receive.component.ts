import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CustomerAccountService } from '../../services/customer-account.service';
import { ParcelsService } from '../../services/parcels.service';
import {
  ParcelOpsApiService,
  type ReceiveParcelResultDto,
  type SuiteReceiveLookupDto,
} from '../../services/parcel-ops-api.service';

@Component({
  selector: 'app-parcel-receive',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ops-page">
      <header class="ops-head">
        <div>
          <h1>Receive parcel (warehouse)</h1>
          <p>Register an incoming parcel at the Johannesburg warehouse.</p>
        </div>
        <a routerLink="/received-parcels" class="bb-link">← Back to parcels</a>
      </header>

      @if (!unlocked()) {
        <section class="bb-card bb-card-pad gate">
          <h2 class="bb-card-title">Ops access</h2>
          <p class="hint">
            Enter the <code>Kyc__OpsApiKey</code> from API config (local:
            <code>weyell-local-kyc-ops</code>).
          </p>
          <label class="key-field">
            <span>Ops API key</span>
            <input type="password" [(ngModel)]="opsKeyInput" name="opsKey" autocomplete="off" />
          </label>
          @if (gateError()) {
            <p class="err" role="alert">{{ gateError() }}</p>
          }
          <button type="button" class="bb-btn bb-btn-primary" (click)="unlock()" [disabled]="busy()">
            Connect
          </button>
        </section>
      } @else {
        <form class="form-stack" (ngSubmit)="submit()">
          <section class="bb-card bb-card-pad">
            <h2 class="bb-card-title">Customer suite</h2>
            <p class="hint">
              The suite number comes from the label on the parcel. When you are testing as a
              customer, we pre-fill it from your account profile.
            </p>

            @if (profileSuite()) {
              <div class="profile-suite">
                <span class="material-icons-outlined">person</span>
                <div>
                  <strong>Your account suite</strong>
                  <span class="mono">{{ profileSuite() }}</span>
                </div>
                @if (suiteNumber !== profileSuite()) {
                  <button type="button" class="bb-link-btn" (click)="useProfileSuite()">
                    Use my suite
                  </button>
                }
              </div>
            }

            <label>
              <span>Suite number *</span>
              <input
                [(ngModel)]="suiteNumber"
                name="suiteNumber"
                placeholder="WY-24789"
                required
                (blur)="lookupSuite()"
                (ngModelChange)="suiteLookup.set(null); suiteLookupError.set(null)"
              />
            </label>

            @if (lookupLoading()) {
              <p class="hint">Looking up customer…</p>
            }
            @if (suiteLookup(); as lookup) {
              <div class="lookup-card" [class.blocked]="!lookup.canReceiveParcels">
                <strong>{{ lookup.customerDisplayName }}</strong>
                <span>{{ lookup.customerEmail }}</span>
                <span class="status">Suite {{ lookup.suiteNumber }} · {{ lookup.suiteAccessStatus }}</span>
                @if (!lookup.canReceiveParcels) {
                  <p class="warn">{{ lookup.customerMessage }}</p>
                }
              </div>
            }
            @if (suiteLookupError()) {
              <p class="err">{{ suiteLookupError() }}</p>
            }
          </section>

          <section class="bb-card bb-card-pad">
            <h2 class="bb-card-title">Parcel details</h2>
            <div class="row2">
              <label>
                <span>Retailer *</span>
                <input [(ngModel)]="retailer" name="retailer" placeholder="Takealot" required />
              </label>
              <label>
                <span>Tracking number</span>
                <input [(ngModel)]="trackingNumber" name="tracking" placeholder="BRC200012301ZA" />
              </label>
            </div>
            <div class="row2">
              <label>
                <span>Item name *</span>
                <input [(ngModel)]="itemName" name="itemName" required />
              </label>
              <label>
                <span>Category *</span>
                <input [(ngModel)]="category" name="category" placeholder="Electronics" required />
              </label>
            </div>
            <div class="row3">
              <label>
                <span>Weight (kg)</span>
                <input type="number" step="0.01" min="0" [(ngModel)]="weightKg" name="weightKg" />
              </label>
              <label>
                <span>Declared value (ZAR)</span>
                <input type="number" step="0.01" min="0" [(ngModel)]="declaredValueZar" name="value" />
              </label>
              <label>
                <span>Dimensions</span>
                <input [(ngModel)]="dimensionsLabel" name="dims" placeholder="40x20x5 cm" />
              </label>
            </div>
            @if (error()) {
              <p class="err" role="alert">{{ error() }}</p>
            }
            <div class="actions">
              <button type="button" class="bb-btn bb-btn-ghost" (click)="resetParcelFields()" [disabled]="busy()">
                Clear parcel fields
              </button>
              <button
                type="submit"
                class="bb-btn bb-btn-primary"
                [disabled]="busy() || !canSubmit() || suiteLookup()?.canReceiveParcels === false"
              >
                {{ busy() ? 'Saving…' : 'Receive parcel' }}
              </button>
            </div>
          </section>
        </form>

        @if (lastResult(); as r) {
          <section class="bb-card bb-card-pad success-card" role="status">
            <h2 class="bb-card-title">Received</h2>
            <p>
              <strong>{{ r.itemName }}</strong> for
              <strong>{{ r.customerDisplayName }}</strong> ({{ r.customerEmail }})
            </p>
            <dl class="meta">
              <div><dt>Parcel ID</dt><dd>{{ r.parcelId }}</dd></div>
              <div><dt>Suite</dt><dd>{{ r.suiteNumber }}</dd></div>
              <div><dt>Tracking</dt><dd>{{ r.trackingNumber || '—' }}</dd></div>
              <div><dt>Status</dt><dd>{{ r.status }}</dd></div>
              <div><dt>Received</dt><dd>{{ r.receivedAtUtc | date:'medium' }}</dd></div>
            </dl>
            <p class="hint">Customer will see this on Received Parcels after refresh.</p>
          </section>
        }

        <button type="button" class="bb-link-btn disconnect" (click)="disconnect()">Disconnect ops key</button>
      }
    </div>
  `,
  styles: `
    .ops-page { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
    .ops-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
    .ops-head h1 { margin: 0 0 0.35rem; font-size: 1.35rem; }
    .ops-head p { margin: 0; color: var(--bb-muted); font-size: 0.88rem; }
    .form-stack { display: flex; flex-direction: column; gap: 1rem; }
    .hint { font-size: 0.82rem; color: var(--bb-muted); margin: 0 0 0.75rem; line-height: 1.45; }
    .hint code { font-size: 0.78rem; }
    .key-field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.75rem; }
    .key-field span { font-size: 0.78rem; font-weight: 600; color: var(--bb-muted); }
    .key-field input {
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
    }
    .profile-suite {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.65rem 0.75rem;
      margin-bottom: 0.75rem;
      background: var(--bb-primary-soft);
      border-radius: var(--bb-radius-sm);
      font-size: 0.85rem;
    }
    .profile-suite .material-icons-outlined { color: var(--bb-link); }
    .profile-suite div { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; }
    .mono { font-family: ui-monospace, monospace; font-weight: 600; }
    .lookup-card {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: 0.65rem 0.75rem;
      margin-bottom: 0.5rem;
      background: var(--bb-success-soft);
      border: 1px solid #86efac;
      border-radius: var(--bb-radius-sm);
      font-size: 0.85rem;
    }
    .lookup-card.blocked {
      background: var(--bb-danger-soft);
      border-color: var(--bb-danger-border);
    }
    .lookup-card .status { color: var(--bb-muted); font-size: 0.78rem; }
    .lookup-card .warn { color: #991b1b; margin: 0.35rem 0 0; font-size: 0.8rem; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
    .row3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.85rem; }
    @media (max-width: 640px) { .row2, .row3 { grid-template-columns: 1fr; } }
    label { display: flex; flex-direction: column; gap: 0.3rem; }
    label span { font-size: 0.78rem; font-weight: 600; color: var(--bb-muted); }
    label input {
      font-weight: 400;
      color: var(--bb-text);
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
    }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.35rem; }
    .err { color: #b91c1c; font-size: 0.85rem; margin: 0; }
    .success-card { margin-top: 1rem; border-color: var(--bb-success); background: var(--bb-success-soft); }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.35rem 1rem; margin: 0.75rem 0 0; font-size: 0.85rem; }
    .meta dt { color: var(--bb-muted); font-weight: 600; }
    .meta dd { margin: 0; }
    .disconnect { margin-top: 1rem; }
  `,
})
export class ParcelReceiveComponent implements OnInit {
  private readonly opsApi = inject(ParcelOpsApiService);
  private readonly accountApi = inject(CustomerAccountService);
  private readonly parcelsApi = inject(ParcelsService);

  readonly unlocked = signal(false);
  readonly busy = signal(false);
  readonly lookupLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly gateError = signal<string | null>(null);
  readonly suiteLookupError = signal<string | null>(null);
  readonly suiteLookup = signal<SuiteReceiveLookupDto | null>(null);
  readonly lastResult = signal<ReceiveParcelResultDto | null>(null);
  readonly profileSuite = signal<string | null>(null);

  opsKeyInput = '';
  private opsKey = '';

  suiteNumber = '';
  retailer = '';
  trackingNumber = '';
  itemName = '';
  category = 'Electronics';
  weightKg: number | null = null;
  declaredValueZar: number | null = null;
  dimensionsLabel = '';

  ngOnInit(): void {
    const stored = this.opsApi.getStoredOpsKey();
    if (stored) {
      this.opsKey = stored;
      this.opsKeyInput = stored;
      this.unlocked.set(true);
      this.loadProfileSuite();
    }
  }

  canSubmit(): boolean {
    return !!(
      this.suiteNumber.trim() &&
      this.retailer.trim() &&
      this.itemName.trim() &&
      this.category.trim()
    );
  }

  unlock(): void {
    const key = this.opsKeyInput.trim();
    if (!key) {
      this.gateError.set('Enter the ops API key.');
      return;
    }
    this.opsApi.storeOpsKey(key);
    this.opsKey = key;
    this.unlocked.set(true);
    this.gateError.set(null);
    this.loadProfileSuite();
  }

  disconnect(): void {
    this.opsApi.clearOpsKey();
    this.opsKey = '';
    this.unlocked.set(false);
    this.lastResult.set(null);
    this.suiteLookup.set(null);
  }

  useProfileSuite(): void {
    const suite = this.profileSuite();
    if (suite) {
      this.suiteNumber = suite;
      this.lookupSuite();
    }
  }

  loadProfileSuite(): void {
    this.accountApi.ensureAccountLoaded().subscribe({
      next: () => {
        this.parcelsApi.loadDashboard().subscribe({
          next: () => this.applyProfileSuite(),
          error: () => this.applyProfileSuite(),
        });
      },
    });
  }

  private applyProfileSuite(): void {
    const fromAccount = this.accountApi.account()?.suiteAddress?.suiteNumber?.trim();
    const fromDashboard = this.parcelsApi.dashboard()?.suiteNumber?.trim();
    const suite = fromAccount || fromDashboard || null;
    this.profileSuite.set(suite);
    if (suite && !this.suiteNumber.trim()) {
      this.suiteNumber = suite;
      this.lookupSuite();
    }
  }

  lookupSuite(): void {
    const suite = this.suiteNumber.trim();
    if (!suite || !this.opsKey) return;
    this.lookupLoading.set(true);
    this.suiteLookupError.set(null);
    this.opsApi.lookupSuite(suite, this.opsKey).subscribe({
      next: (lookup) => {
        this.suiteLookup.set(lookup);
        this.lookupLoading.set(false);
      },
      error: (err: unknown) => {
        this.suiteLookup.set(null);
        this.lookupLoading.set(false);
        this.suiteLookupError.set(this.formatError(err, 'Suite not found or invalid.'));
      },
    });
  }

  resetParcelFields(): void {
    this.retailer = '';
    this.trackingNumber = '';
    this.itemName = '';
    this.category = 'Electronics';
    this.weightKg = null;
    this.declaredValueZar = null;
    this.dimensionsLabel = '';
    this.error.set(null);
  }

  submit(): void {
    if (!this.canSubmit() || !this.opsKey) return;
    if (this.suiteLookup()?.canReceiveParcels === false) return;
    this.busy.set(true);
    this.error.set(null);
    this.opsApi
      .receive(
        {
          suiteNumber: this.suiteNumber.trim(),
          retailer: this.retailer.trim(),
          trackingNumber: this.trackingNumber.trim() || null,
          itemName: this.itemName.trim(),
          category: this.category.trim(),
          declaredValueZar: this.declaredValueZar,
          dimensionsLabel: this.dimensionsLabel.trim() || null,
          weightKg: this.weightKg,
        },
        this.opsKey,
      )
      .subscribe({
        next: (r) => {
          this.busy.set(false);
          this.lastResult.set(r);
          this.resetParcelFields();
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(this.formatError(err, 'Could not register parcel.'));
        },
      });
  }

  private formatError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | string | null;
      if (typeof body === 'string' && body) return body;
      if (body && typeof body === 'object' && body.detail) return body.detail;
      if (body && typeof body === 'object' && body.title) return body.title;
      if (err.status === 401 || err.status === 403) {
        return 'Invalid ops API key. Check KYC_OPS_API_KEY in your .env.';
      }
    }
    return fallback;
  }
}
