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
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import {
  KycOpsApiService,
  type PendingKycReviewDto,
} from '../../services/kyc-ops-api.service';

/** Must match KYC_OPS_API_KEY in repo-root .env */
const LOCAL_OPS_KEY = 'weyell-local-kyc-ops';

@Component({
  selector: 'app-kyc-ops-review',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ops-page">
      <header class="ops-head">
        <div>
          <h1>KYC review queue</h1>
          <p>Approve or reject customer identity submissions (ops API key required).</p>
        </div>
        <a routerLink="/my-address" class="bb-link">← Back to portal</a>
      </header>

      @if (!unlocked()) {
        <section class="bb-card bb-card-pad gate">
          <h2 class="bb-card-title">Ops access</h2>
          <ol class="steps">
            <li>Customer submits KYC from <strong>My Address</strong> (with <code>KYC_AUTO_VERIFY_ON_SUBMIT=false</code>).</li>
            <li>Paste the ops key from <code>.env</code> → <code>KYC_OPS_API_KEY</code>.</li>
            <li>Approve or reject — the customer sees the result on their profile.</li>
          </ol>
          <p class="hint">
            Local Docker default:
            <code class="key-chip">{{ localOpsKey }}</code>
            <button type="button" class="bb-link-btn copy-btn" (click)="copyLocalKey()">Copy</button>
          </p>
          <label class="key-field">
            <span>Ops API key</span>
            <input type="password" [(ngModel)]="opsKeyInput" name="opsKey" autocomplete="off" />
          </label>
          @if (gateError()) {
            <p class="err" role="alert">{{ gateError() }}</p>
          }
          <button type="button" class="bb-btn bb-btn-primary" (click)="unlock()" [disabled]="busy()">
            {{ busy() ? 'Connecting…' : 'Connect' }}
          </button>
        </section>
      } @else {
        <div class="toolbar">
          <button type="button" class="bb-btn bb-btn-outline bb-btn-outline-sm" (click)="refresh()" [disabled]="busy()">
            Refresh
          </button>
          <button type="button" class="bb-link-btn" (click)="disconnect()">Disconnect</button>
        </div>

        @if (success()) {
          <p class="ok-banner" role="status">{{ success() }}</p>
        }
        @if (error()) {
          <p class="err-banner" role="alert">{{ error() }}</p>
        }

        @if (busy() && pending().length === 0) {
          <nk-pulse-loader label="Loading KYC queue…" />
        } @else if (pending().length === 0 && !busy()) {
          <section class="bb-card bb-card-pad empty">
            <span class="material-icons-outlined">inbox</span>
            <p>No customers awaiting KYC review.</p>
            <p class="hint">Ask the customer to open <strong>My Address</strong> and tap <strong>Start KYC</strong>.</p>
          </section>
        } @else {
          <ul class="queue">
            @for (item of pending(); track item.userId) {
              <li class="bb-card bb-card-pad item">
                <div class="item-head">
                  <div>
                    <strong>{{ item.displayName }}</strong>
                    <span class="email">{{ item.email }}</span>
                  </div>
                  <span class="bb-badge bb-badge-warning">Pending</span>
                </div>
                <dl class="meta">
                  <div><dt>Phone</dt><dd>{{ item.phone || '—' }}</dd></div>
                  <div><dt>ID</dt><dd>{{ item.idDocumentType }} · {{ item.idNumber }}</dd></div>
                  <div><dt>Submitted</dt><dd>{{ item.submittedOnUtc | date:'medium' }}</dd></div>
                </dl>
                <div class="actions">
                  <button
                    type="button"
                    class="bb-btn bb-btn-primary bb-btn-outline-sm"
                    [disabled]="busy()"
                    (click)="approve(item)"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    class="bb-btn bb-btn-outline bb-btn-outline-sm danger-btn"
                    [disabled]="busy()"
                    (click)="reject(item)"
                  >
                    Reject
                  </button>
                </div>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: `
    .ops-page {
      max-width: 720px;
      margin: 0 auto;
    }
    .ops-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1.25rem;
    }
    .ops-head h1 {
      margin: 0 0 0.35rem;
      font-size: 1.35rem;
      font-weight: 700;
    }
    .ops-head p {
      margin: 0;
      font-size: 0.88rem;
      color: var(--bb-muted);
    }
    .hint {
      font-size: 0.85rem;
      color: var(--bb-muted);
      line-height: 1.5;
      margin: 0 0 1rem;
    }
    .hint code {
      font-size: 0.78rem;
      background: #f1f5f9;
      padding: 0.1rem 0.35rem;
      border-radius: 4px;
    }
    .steps {
      margin: 0 0 0.85rem;
      padding-left: 1.2rem;
      font-size: 0.82rem;
      color: var(--bb-muted);
      line-height: 1.5;
    }
    .key-chip {
      font-size: 0.8rem;
      background: #f1f5f9;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
    }
    .copy-btn { font-size: 0.8rem; }
    .ok-banner {
      background: var(--bb-success-soft);
      color: #15803d;
      border: 1px solid #86efac;
      border-radius: var(--bb-radius-sm);
      padding: 0.65rem 0.85rem;
      font-size: 0.85rem;
      margin-bottom: 0.75rem;
    }
    .key-field {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin-bottom: 1rem;
      font-size: 0.85rem;
    }
    .key-field input {
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
    }
    .toolbar {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      margin-bottom: 1rem;
    }
    .err, .err-banner {
      color: var(--bb-danger);
      font-size: 0.85rem;
      margin: 0 0 0.75rem;
    }
    .err-banner {
      padding: 0.75rem 1rem;
      background: var(--bb-danger-soft);
      border: 1px solid var(--bb-danger-border);
      border-radius: var(--bb-radius-sm);
    }
    .empty {
      text-align: center;
      color: var(--bb-muted);
    }
    .empty .material-icons-outlined {
      font-size: 2.5rem;
      opacity: 0.5;
    }
    .queue {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .item-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .item-head strong {
      display: block;
      font-size: 1rem;
    }
    .email {
      display: block;
      font-size: 0.8rem;
      color: var(--bb-muted);
      font-weight: 400;
    }
    .meta > div {
      display: grid;
      grid-template-columns: 90px 1fr;
      gap: 0.5rem;
      font-size: 0.82rem;
      padding: 0.25rem 0;
    }
    .meta dt {
      margin: 0;
      color: var(--bb-muted);
    }
    .meta dd {
      margin: 0;
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.85rem;
      padding-top: 0.85rem;
      border-top: 1px solid var(--bb-border);
    }
    .danger-btn {
      color: var(--bb-danger);
      border-color: #fecaca;
    }
    .bb-link-btn {
      border: none;
      background: none;
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--bb-link);
      cursor: pointer;
    }
  `,
})
export class KycOpsReviewComponent implements OnInit {
  readonly localOpsKey = LOCAL_OPS_KEY;
  private readonly opsApi = inject(KycOpsApiService);

  readonly unlocked = signal(false);
  readonly pending = signal<PendingKycReviewDto[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly gateError = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  opsKeyInput = LOCAL_OPS_KEY;

  ngOnInit(): void {
    const stored = this.opsApi.getStoredOpsKey();
    if (stored) {
      this.opsKeyInput = stored;
      this.unlocked.set(true);
      this.refresh();
    }
  }

  copyLocalKey(): void {
    void navigator.clipboard?.writeText(LOCAL_OPS_KEY);
    this.opsKeyInput = LOCAL_OPS_KEY;
  }

  unlock(): void {
    const key = this.opsKeyInput.trim();
    if (!key) {
      this.gateError.set('Enter the ops API key.');
      return;
    }
    this.busy.set(true);
    this.gateError.set(null);
    this.opsApi.listPending(key).subscribe({
      next: (list) => {
        this.opsApi.storeOpsKey(key);
        this.unlocked.set(true);
        this.pending.set(list);
        this.busy.set(false);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.gateError.set(this.formatError(err, 'Invalid ops key. Use the value from KYC_OPS_API_KEY in .env.'));
      },
    });
  }

  disconnect(): void {
    this.opsApi.clearOpsKey();
    this.unlocked.set(false);
    this.pending.set([]);
    this.error.set(null);
    this.success.set(null);
  }

  refresh(): void {
    const key = this.opsApi.getStoredOpsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.opsApi.listPending(key).subscribe({
      next: (list) => {
        this.pending.set(list);
        this.busy.set(false);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(this.formatError(err, 'Could not load pending KYC queue.'));
      },
    });
  }

  approve(item: PendingKycReviewDto): void {
    const key = this.opsApi.getStoredOpsKey();
    if (!key) return;
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    this.opsApi.approve(item.userId, key).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.success.set(res.message || `Approved ${item.displayName}.`);
        this.refresh();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(this.formatError(err, `Could not approve ${item.email}.`));
      },
    });
  }

  reject(item: PendingKycReviewDto): void {
    const key = this.opsApi.getStoredOpsKey();
    if (!key) return;
    const reason = window.prompt('Rejection reason (optional):') ?? undefined;
    this.busy.set(true);
    this.error.set(null);
    this.success.set(null);
    this.opsApi.reject(item.userId, key, reason || undefined).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.success.set(res.message || `Rejected ${item.displayName}.`);
        this.refresh();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(this.formatError(err, `Could not reject ${item.email}.`));
      },
    });
  }

  private formatError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | string | null;
      if (typeof body === 'string' && body) return body;
      if (body && typeof body === 'object' && body.detail) return body.detail;
      if (err.status === 400 && typeof body === 'object' && body?.title?.includes('CSRF')) {
        return 'Session security token expired — refresh the page and try again.';
      }
      if (err.status === 401 || err.status === 403) {
        return 'Ops key rejected. Check KYC_OPS_API_KEY in .env matches what you entered.';
      }
    }
    return fallback;
  }
}
