import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { IdDocumentType, KycDocumentSide } from '../../models/customer-account.models';

/** Visual example of the photo customers should take for each KYC document side. */
@Component({
  selector: 'app-kyc-document-sample',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="sample" [attr.aria-label]="ariaLabel()">
      <div class="sample-badge">Example</div>
      <div class="sample-art" [class]="artClass()">
        @switch (variant()) {
          @case ('id-front') {
            <svg viewBox="0 0 160 100" class="sample-svg" aria-hidden="true">
              <rect x="4" y="8" width="152" height="84" rx="8" fill="#fff" stroke="#94a3b8" stroke-width="2" />
              <circle cx="36" cy="42" r="18" fill="#e2e8f0" stroke="#cbd5e1" />
              <rect x="62" y="24" width="78" height="6" rx="3" fill="#e2e8f0" />
              <rect x="62" y="36" width="64" height="5" rx="2.5" fill="#f1f5f9" />
              <rect x="62" y="46" width="70" height="5" rx="2.5" fill="#f1f5f9" />
              <rect x="14" y="68" width="132" height="8" rx="4" fill="#dcfce7" stroke="#86efac" />
              <text x="80" y="74" text-anchor="middle" font-size="7" fill="#166534" font-weight="700">FRONT</text>
            </svg>
          }
          @case ('id-back') {
            <svg viewBox="0 0 160 100" class="sample-svg" aria-hidden="true">
              <rect x="4" y="8" width="152" height="84" rx="8" fill="#fff" stroke="#94a3b8" stroke-width="2" />
              <rect x="20" y="22" width="120" height="28" rx="4" fill="#f8fafc" stroke="#e2e8f0" />
              @for (i of barcodeLines; track i) {
                <rect [attr.x]="24 + i * 5" y="26" width="3" height="20" fill="#64748b" opacity="0.5" />
              }
              <rect x="14" y="58" width="132" height="14" rx="3" fill="#f1f5f9" />
              <rect x="18" y="62" width="124" height="3" rx="1.5" fill="#cbd5e1" />
              <rect x="18" y="67" width="110" height="3" rx="1.5" fill="#cbd5e1" />
              <text x="80" y="52" text-anchor="middle" font-size="7" fill="#64748b" font-weight="700">BACK</text>
            </svg>
          }
          @case ('passport-front') {
            <svg viewBox="0 0 120 160" class="sample-svg sample-svg-tall" aria-hidden="true">
              <rect x="8" y="6" width="104" height="148" rx="6" fill="#1e3a5f" />
              <rect x="14" y="14" width="92" height="132" rx="4" fill="#fff" />
              <text x="60" y="30" text-anchor="middle" font-size="8" fill="#b45309" font-weight="700">PASSPORT</text>
              <circle cx="38" cy="58" r="16" fill="#e2e8f0" stroke="#cbd5e1" />
              <rect x="58" y="42" width="40" height="5" rx="2.5" fill="#e2e8f0" />
              <rect x="58" y="52" width="36" height="4" rx="2" fill="#f1f5f9" />
              <rect x="58" y="60" width="38" height="4" rx="2" fill="#f1f5f9" />
              <rect x="18" y="118" width="84" height="8" rx="2" fill="#f1f5f9" />
              <rect x="18" y="128" width="84" height="6" rx="2" fill="#e2e8f0" />
            </svg>
          }
          @case ('selfie') {
            <svg viewBox="0 0 120 140" class="sample-svg sample-svg-tall" aria-hidden="true">
              <ellipse cx="60" cy="38" rx="22" ry="26" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="2" />
              <path d="M28 72 Q60 58 92 72 L92 130 Q60 118 28 130 Z" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="2" />
              <rect x="72" y="78" width="34" height="44" rx="5" fill="#fff" stroke="#86efac" stroke-width="2" />
              <circle cx="84" cy="94" r="8" fill="#e2e8f0" />
              <rect x="78" y="106" width="22" height="3" rx="1.5" fill="#dcfce7" />
              <path d="M48 48 Q60 54 72 48" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" />
            </svg>
          }
        }
      </div>
      <figcaption class="sample-caption">{{ caption() }}</figcaption>
      <ul class="sample-tips">
        @for (tip of tips(); track tip) {
          <li>{{ tip }}</li>
        }
      </ul>
    </figure>
  `,
  styles: `
    .sample {
      margin: 0 0 0.65rem;
      padding: 0;
      position: relative;
    }

    .sample-badge {
      position: absolute;
      top: 0.35rem;
      left: 0.35rem;
      z-index: 1;
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.15rem 0.4rem;
      border-radius: 4px;
      background: rgba(41, 41, 40, 0.75);
      color: #fff;
    }

    .sample-art {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 88px;
      padding: 0.65rem 0.5rem 0.5rem;
      border-radius: var(--bb-radius-sm);
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      border: 1px solid #e2e8f0;
    }

    .sample-art--selfie {
      min-height: 108px;
    }

    .sample-svg {
      width: 100%;
      max-width: 148px;
      height: auto;
      display: block;
    }

    .sample-svg-tall {
      max-width: 88px;
    }

    .sample-caption {
      margin: 0.45rem 0 0.35rem;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--bb-text);
      line-height: 1.35;
      text-align: center;
    }

    .sample-tips {
      margin: 0;
      padding: 0 0 0 1rem;
      font-size: 0.65rem;
      color: var(--bb-muted);
      line-height: 1.45;
    }

    .sample-tips li {
      margin-bottom: 0.15rem;
    }
  `,
})
export class KycDocumentSampleComponent {
  readonly side = input.required<KycDocumentSide>();
  readonly idDocumentType = input.required<IdDocumentType>();

  readonly barcodeLines = Array.from({ length: 22 }, (_, i) => i);

  readonly variant = computed(() => {
    const side = this.side();
    const doc = this.idDocumentType();
    if (side === 'selfie') return 'selfie';
    if (side === 'back') return 'id-back';
    if (side === 'front' && doc === 'Passport') return 'passport-front';
    return 'id-front';
  });

  readonly artClass = computed(() =>
    this.variant() === 'selfie' || this.variant() === 'passport-front'
      ? 'sample-art sample-art--selfie'
      : 'sample-art',
  );

  readonly caption = computed(() => {
    const side = this.side();
    const doc = this.idDocumentType();
    if (side === 'selfie') {
      return doc === 'Passport'
        ? 'Selfie while holding your passport open on the photo page'
        : 'Selfie while holding your ID next to your face';
    }
    if (side === 'back') {
      return 'Lay the back flat — barcode and text readable';
    }
    if (doc === 'Passport') {
      return 'Photo page only — no glare, all corners in frame';
    }
    return 'Front of ID flat on a surface — all corners visible';
  });

  readonly tips = computed((): string[] => {
    const side = this.side();
    if (side === 'selfie') {
      return ['Good lighting on your face', 'ID fully visible, not cropped', 'No filters or sunglasses'];
    }
    if (side === 'back') {
      return ['Avoid shadows on the barcode', 'No fingers covering edges'];
    }
    return ['Use daylight or bright indoor light', 'No blur — text must be sharp', 'No screenshots'];
  });

  ariaLabel(): string {
    return `Example photo: ${this.caption()}`;
  }
}
