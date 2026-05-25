import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CustomerProfile, KycDocumentSide } from '../../models/customer-account.models';
import { isProfileComplete } from '../../models/customer-account.models';
import { CustomerAccountApiService } from '../../services/customer-account-api.service';
import { CustomerAccountService } from '../../services/customer-account.service';

@Component({
  selector: 'app-kyc-submit-dialog',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" role="presentation" (click)="closed.emit()"></div>
    <div class="dialog" role="dialog" aria-labelledby="kyc-dialog-title" aria-modal="true">
      <header class="dialog-head">
        <h2 id="kyc-dialog-title">Verify your identity</h2>
        <button type="button" class="icon-close" aria-label="Close" (click)="closed.emit()">
          <span class="material-icons-outlined">close</span>
        </button>
      </header>

      @if (!profileComplete()) {
        <p class="lead warn">
          Complete your profile first — we need your legal name, phone, ID type, and ID number
          before KYC can start.
        </p>
        <footer class="dialog-actions">
          <button type="button" class="bb-btn bb-btn-outline" (click)="closed.emit()">Cancel</button>
          <button type="button" class="bb-btn bb-btn-primary" (click)="editProfile.emit()">
            Edit profile
          </button>
        </footer>
      } @else {
        <p class="lead">
          We use your profile details to verify you for parcel receiving and ship-out. Review the
          information below, then submit for review.
        </p>

        <ul class="review">
          <li>
            <span class="material-icons-outlined">badge</span>
            <div>
              <span class="lbl">Full name</span>
              <strong>{{ profile().displayName }}</strong>
            </div>
          </li>
          <li>
            <span class="material-icons-outlined">description</span>
            <div>
              <span class="lbl">ID document</span>
              <strong>{{ idDocumentLabel() }}</strong>
            </div>
          </li>
          <li>
            <span class="material-icons-outlined">pin</span>
            <div>
              <span class="lbl">ID number</span>
              <strong>{{ profile().idNumber }}</strong>
            </div>
          </li>
          <li>
            <span class="material-icons-outlined">public</span>
            <div>
              <span class="lbl">Destination</span>
              <strong>🇸🇿 {{ profile().destinationCountryLabel }}</strong>
            </div>
          </li>
        </ul>

        <div class="uploads">
          <p class="uploads-title">Upload your documents</p>
          @for (side of requiredSides(); track side) {
            <label class="upload-row">
              <span>{{ sideLabel(side) }}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                [disabled]="uploadBusy() === side || busy()"
                (change)="onFileSelected(side, $event)"
              />
              @if (uploadedSides().has(side)) {
                <span class="upload-ok material-icons-outlined">check_circle</span>
              }
            </label>
          }
        </div>

        <label class="consent">
          <input type="checkbox" [(ngModel)]="confirmed" name="kycConfirm" />
          <span>
            I confirm these details are correct and I consent to identity verification for my
            WeYell account.
          </span>
        </label>

        @if (error()) {
          <p class="err" role="alert">{{ error() }}</p>
        }

        <footer class="dialog-actions">
          <button type="button" class="bb-btn bb-btn-outline" (click)="closed.emit()">Cancel</button>
          <button
            type="button"
            class="bb-btn bb-btn-primary"
            [disabled]="!confirmed() || busy() || !allDocumentsUploaded()"
            (click)="submit()"
          >
            {{ busy() ? 'Submitting…' : 'Submit for verification' }}
          </button>
        </footer>
      }
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      z-index: 200;
    }
    .dialog {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 201;
      width: min(480px, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      overflow-y: auto;
      background: var(--bb-surface);
      border-radius: var(--bb-radius);
      box-shadow: var(--bb-shadow-md);
      padding: 1.35rem 1.5rem 1.25rem;
    }
    .dialog-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .dialog-head h2 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--bb-text);
    }
    .icon-close {
      border: none;
      background: #f1f5f9;
      border-radius: 8px;
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      color: var(--bb-muted);
      cursor: pointer;
    }
    .lead {
      margin: 0 0 1rem;
      font-size: 0.88rem;
      color: var(--bb-muted);
      line-height: 1.5;
    }
    .lead.warn {
      color: #b45309;
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: var(--bb-radius-sm);
      padding: 0.75rem;
    }
    .review {
      list-style: none;
      margin: 0 0 1rem;
      padding: 0;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      overflow: hidden;
    }
    .review li {
      display: flex;
      gap: 0.65rem;
      align-items: flex-start;
      padding: 0.7rem 0.85rem;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.85rem;
    }
    .review li:last-child {
      border-bottom: none;
    }
    .review .material-icons-outlined {
      font-size: 1.15rem;
      color: #94a3b8;
      margin-top: 0.1rem;
    }
    .lbl {
      display: block;
      font-size: 0.72rem;
      color: var(--bb-muted);
      margin-bottom: 0.1rem;
    }
    .uploads {
      margin: 0 0 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      padding: 0.75rem;
    }
    .uploads-title {
      margin: 0 0 0.65rem;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--bb-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .upload-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 0.5rem;
      align-items: center;
      margin-bottom: 0.55rem;
      font-size: 0.82rem;
    }
    .upload-row:last-child { margin-bottom: 0; }
    .upload-row input[type='file'] { font-size: 0.75rem; }
    .upload-ok { color: #15803d; font-size: 1.1rem; }
    .consent {
      display: flex;
      gap: 0.55rem;
      align-items: flex-start;
      font-size: 0.82rem;
      color: var(--bb-text);
      line-height: 1.45;
      margin-bottom: 0.75rem;
      cursor: pointer;
    }
    .consent input {
      margin-top: 0.2rem;
      accent-color: var(--bb-primary);
      flex-shrink: 0;
    }
    .err {
      margin: 0 0 0.75rem;
      font-size: 0.82rem;
      color: var(--bb-danger);
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
  `,
})
export class KycSubmitDialogComponent implements OnInit {
  readonly profile = input.required<CustomerProfile>();

  readonly closed = output<void>();
  readonly editProfile = output<void>();
  readonly submitted = output<void>();

  private readonly accountApi = inject(CustomerAccountApiService);
  private readonly accountService = inject(CustomerAccountService);

  readonly confirmed = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly uploadBusy = signal<KycDocumentSide | null>(null);
  readonly uploadedSides = signal<Set<string>>(new Set());

  readonly profileComplete = () => isProfileComplete(this.profile());

  readonly requiredSides = computed((): KycDocumentSide[] => {
    return this.profile().idDocumentType === 'Passport'
      ? ['front', 'selfie']
      : ['front', 'back', 'selfie'];
  });

  readonly allDocumentsUploaded = computed(() => {
    const uploaded = this.uploadedSides();
    return this.requiredSides().every((s) => uploaded.has(s));
  });

  ngOnInit(): void {
    if (!this.profileComplete()) return;
    this.accountApi.getKycStatus().subscribe({
      next: (status) => {
        const confirmed = new Set(
          status.documents.filter((d) => d.confirmed).map((d) => d.side),
        );
        this.uploadedSides.set(confirmed);
      },
      error: () => {},
    });
  }

  sideLabel(side: KycDocumentSide): string {
    if (side === 'front') return 'ID document (front)';
    if (side === 'back') return 'ID document (back)';
    return 'Selfie photo';
  }

  onFileSelected(side: KycDocumentSide, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadBusy.set(side);
    this.error.set(null);
    this.accountApi.uploadKycDocument(side, file).subscribe({
      next: () => {
        this.uploadedSides.update((set) => new Set([...set, side]));
        this.uploadBusy.set(null);
      },
      error: (err: unknown) => {
        this.uploadBusy.set(null);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  idDocumentLabel(): string {
    return this.profile().idDocumentType === 'Passport' ? 'Passport' : 'National ID';
  }

  submit(): void {
    if (!this.confirmed() || this.busy() || !this.allDocumentsUploaded()) return;
    this.busy.set(true);
    this.error.set(null);
    this.accountService.submitKyc().subscribe({
      next: () => {
        this.busy.set(false);
        this.submitted.emit();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(this.errorMessage(err));
      },
    });
  }

  private errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string } | string | null;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object' && body.detail) return body.detail;
    }
    if (err instanceof Error && err.message) return err.message;
    return 'Could not submit KYC. Try again.';
  }
}
