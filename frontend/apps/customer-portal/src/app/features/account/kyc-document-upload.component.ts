import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { CustomerProfile, KycDocumentSide } from '../../models/customer-account.models';
import { CustomerAccountApiService } from '../../services/customer-account-api.service';

const KYC_MAX_BYTES = 12 * 1024 * 1024;
const KYC_ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

@Component({
  selector: 'app-kyc-document-upload',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="kyc-uploads">
      @for (side of requiredSides(); track side) {
        <label class="upload-card" [class.done]="uploadedSides().has(side)" [class.busy]="uploadBusy() === side">
          <input
            type="file"
            class="file-input"
            accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp,.heic"
            [disabled]="uploadBusy() === side"
            (change)="onFileSelected(side, $event)"
          />
          <span class="upload-icon material-icons-outlined">
            @if (uploadedSides().has(side)) {
              check_circle
            } @else if (uploadBusy() === side) {
              hourglass_top
            } @else {
              upload_file
            }
          </span>
          <span class="upload-label">{{ sideLabel(side) }}</span>
          <span class="upload-hint">JPG, PNG or WebP · max 12 MB</span>
          @if (uploadedSides().has(side)) {
            <span class="upload-status">Uploaded</span>
          } @else if (uploadBusy() === side) {
            <span class="upload-status">Uploading…</span>
          } @else {
            <span class="upload-status">Tap to choose file</span>
          }
        </label>
      }
    </div>
    @if (error()) {
      <p class="upload-err" role="alert">{{ error() }}</p>
    }
  `,
  styles: `
    .kyc-uploads {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.75rem;
    }
    .upload-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.35rem;
      padding: 1rem 0.75rem;
      border: 2px dashed #cbd5e1;
      border-radius: var(--bb-radius-sm);
      background: #f8fafc;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .upload-card:hover:not(.busy) {
      border-color: var(--bb-link);
      background: var(--bb-primary-soft);
    }
    .upload-card.done {
      border-color: #86efac;
      border-style: solid;
      background: #f0fdf4;
    }
    .upload-card.busy {
      opacity: 0.75;
      cursor: wait;
    }
    .file-input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
      width: 100%;
      height: 100%;
    }
    .upload-icon {
      font-size: 1.75rem !important;
      color: #64748b;
    }
    .upload-card.done .upload-icon { color: #15803d; }
    .upload-card:hover:not(.busy):not(.done) .upload-icon { color: var(--bb-link); }
    .upload-label {
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--bb-text);
      line-height: 1.3;
    }
    .upload-hint {
      font-size: 0.68rem;
      color: var(--bb-muted);
    }
    .upload-status {
      font-size: 0.72rem;
      font-weight: 600;
      color: var(--bb-link);
      margin-top: 0.15rem;
    }
    .upload-card.done .upload-status { color: #15803d; }
    .upload-err {
      margin: 0.65rem 0 0;
      font-size: 0.82rem;
      color: var(--bb-danger);
    }
  `,
})
export class KycDocumentUploadComponent implements OnInit {
  readonly profile = input.required<CustomerProfile>();

  private readonly accountApi = inject(CustomerAccountApiService);

  readonly uploadBusy = signal<KycDocumentSide | null>(null);
  readonly uploadedSides = signal<Set<string>>(new Set());
  readonly error = signal<string | null>(null);

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
    const isPassport = this.profile().idDocumentType === 'Passport';
    if (side === 'front') return isPassport ? 'Passport photo page' : 'National ID (front)';
    if (side === 'back') return isPassport ? 'Passport back page' : 'National ID (back)';
    return isPassport ? 'Selfie with passport' : 'Selfie with ID';
  }

  onFileSelected(side: KycDocumentSide, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const validationError = this.validateFile(file);
    if (validationError) {
      this.error.set(validationError);
      return;
    }

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

  private validateFile(file: File): string | null {
    if (file.size <= 0) {
      return 'Choose a photo to upload.';
    }
    if (file.size > KYC_MAX_BYTES) {
      return 'Document must be under 12 MB.';
    }

    const type = this.resolveContentType(file);
    if (!KYC_ALLOWED_TYPES.has(type)) {
      return 'Document must be a photo (JPEG, PNG, or WebP). PDFs are not accepted.';
    }
    return null;
  }

  private resolveContentType(file: File): string {
    const type = file.type?.trim().toLowerCase();
    if (type && type !== 'application/octet-stream') {
      return type.split(';')[0];
    }
    const name = file.name.toLowerCase();
    if (name.endsWith('.png')) return 'image/png';
    if (name.endsWith('.webp')) return 'image/webp';
    if (name.endsWith('.heic')) return 'image/heic';
    if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
    if (name.endsWith('.pdf')) return 'application/pdf';
    return 'application/octet-stream';
  }

  private errorMessage(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string } | string | null;
      if (typeof body === 'string' && body.trim()) return body;
      if (body && typeof body === 'object' && body.detail) return body.detail;
    }
    if (err instanceof Error && err.message) return err.message;
    return 'Could not upload document. Try again.';
  }
}
