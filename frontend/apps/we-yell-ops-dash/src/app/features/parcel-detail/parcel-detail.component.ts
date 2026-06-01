import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import {
  CONDITION_OPTIONS,
  PACKAGING_TYPE_OPTIONS,
  resolvePackagingTypeForSave,
  splitPackagingTypeFromApi,
} from '../../shared/ops-inspection-options';
import {
  OpsPillComponent,
  pillToneForInvoice,
  pillToneForMatch,
  pillToneForParcelStatus,
  type OpsPillTone,
} from '../../shared/ops-pill.component';
import { OPS_CAP } from '../../services/ops-permissions';
import { OpsOverlayService } from '../../shared/ops-overlay.service';
import { opsPhotoUploadError } from '../../services/ops-parcel-photo-upload.service';
import {
  ReceivingApiService,
  type OpsActivityItemDto,
  type OpsParcelDetailDto,
  type OpsPhotoDto,
  type SuiteReceiveLookupDto,
} from '../../services/receiving-api.service';
import { OpsReceivingContextService } from '../../services/ops-receiving-context.service';
import { PulseLoaderComponent } from '@wayel/shared/components/pulse-loader.component';
import { OpsSessionService } from '../../services/ops-session.service';
import { receivingRoutes } from '../../types/receiving.types';

type ParcelDetailTab = 'overview' | 'match' | 'inspection' | 'invoice';

const DETAIL_TABS: ReadonlyArray<{ id: ParcelDetailTab; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'match', label: 'Match', icon: 'link' },
  { id: 'inspection', label: 'Inspection', icon: 'fact_check' },
  { id: 'invoice', label: 'Invoice', icon: 'receipt_long' },
];

@Component({
  selector: 'ops-parcel-detail',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, OpsPillComponent, PulseLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a [routerLink]="routes.dashboard" class="back-link">
        <span class="material-icons-outlined">arrow_back</span>
        Back to Receiving Queue
      </a>

      @if (error()) {
        <p class="err-banner" role="alert">{{ error() }}</p>
      }

      @if (parcel(); as p) {
        <header class="page-head">
          <h1>Parcel Details · {{ p.displayId }}</h1>
          <p class="subtitle">{{ p.itemName }} · {{ p.retailer }}</p>
        </header>

        <div class="summary-bar ops-card">
          <div class="sum-item">
            <span class="label">Tracking</span>
            <strong>{{ p.trackingNumber || '—' }}</strong>
          </div>
          <div class="sum-item">
            <span class="label">Suite</span>
            <strong>{{ p.suiteNumber || '—' }}</strong>
          </div>
          <div class="sum-item">
            <span class="label">Status</span>
            <ops-pill [label]="p.statusLabel" [tone]="statusTone(p.status)" />
          </div>
          <div class="sum-item">
            <span class="label">Quote readiness</span>
            <ops-pill [label]="p.quoteReadiness" [tone]="quoteReadinessTone(p.quoteReadiness)" />
          </div>
          <div class="sum-item">
            <span class="label">Declared value</span>
            <strong>{{ p.declaredValueZar != null ? 'R ' + p.declaredValueZar : '—' }}</strong>
          </div>
          <div class="sum-item">
            <span class="label">Days in warehouse</span>
            <strong>{{ p.daysInWarehouse }} days</strong>
          </div>
        </div>

        <div class="tab-shell ops-card">
          <div class="tab-bar" role="tablist" aria-label="Parcel detail sections">
            @for (tab of detailTabs; track tab.id) {
              <button
                type="button"
                role="tab"
                class="tab-btn"
                [class.active]="activeTab() === tab.id"
                [attr.aria-selected]="activeTab() === tab.id"
                (click)="setTab(tab.id)"
              >
                <span class="material-icons-outlined" aria-hidden="true">{{ tab.icon }}</span>
                {{ tab.label }}
              </button>
            }
          </div>

          <div class="tab-panel ops-card-pad" role="tabpanel">
            @switch (activeTab()) {
              @case ('overview') {
                <div class="overview-grid">
                  <section class="tab-section">
                    <h2 class="section-title">Parcel summary</h2>
                    <dl class="meta-grid">
                      <div><dt>Weight</dt><dd>{{ p.weightKg != null ? p.weightKg + ' kg' : '—' }}</dd></div>
                      <div><dt>Dimensions</dt><dd>{{ p.dimensionsLabel || '—' }}</dd></div>
                      <div><dt>Declared value</dt><dd>{{ p.declaredValueZar != null ? 'R ' + p.declaredValueZar : '—' }}</dd></div>
                      <div><dt>Days in warehouse</dt><dd>{{ p.daysInWarehouse }}</dd></div>
                      <div><dt>Retailer</dt><dd>{{ p.retailer }}</dd></div>
                      <div><dt>Category</dt><dd>{{ p.category || '—' }}</dd></div>
                    </dl>
                  </section>
                  <section class="tab-section">
                    <h2 class="section-title">Customer</h2>
                    <dl class="stack-meta">
                      <div><dt>Name</dt><dd>{{ p.customerDisplayName }}</dd></div>
                      <div><dt>Email</dt><dd>{{ p.customerEmail }}</dd></div>
                      @if (p.customerPhone) {
                        <div><dt>Phone</dt><dd>{{ p.customerPhone }}</dd></div>
                      }
                      <div><dt>Suite</dt><dd>{{ p.suiteNumber || '—' }}</dd></div>
                    </dl>
                  </section>
                </div>
                <section class="tab-section timeline-card">
                  <h2 class="section-title">Activity timeline</h2>
                  @if (activity().length === 0) {
                    <p class="hint">No activity recorded yet.</p>
                  } @else {
                    <ol class="timeline">
                      @for (ev of activity(); track ev.id + ev.occurredAtUtc) {
                        <li [class.timeline-whatsapp]="ev.eventType.startsWith('WHATSAPP_')">
                          <span class="dot" [class.dot-whatsapp]="ev.eventType.startsWith('WHATSAPP_')"></span>
                          <div>
                            <strong>{{ ev.title }}</strong>
                            <span class="when">{{ ev.occurredAtUtc | date:'medium' }} · {{ ev.actor || 'System' }}</span>
                            @if (ev.detail) {
                              <p class="detail">{{ ev.detail }}</p>
                            }
                          </div>
                        </li>
                      }
                    </ol>
                  }
                </section>
              }
              @case ('match') {
                <section id="match-section" class="tab-section match-tab">
                  <div class="section-head">
                    <h2 class="section-title">Match / confirm suite</h2>
                    <ops-pill [label]="suiteMatchLabel()" [tone]="matchTone(suiteMatchLabel())" />
                  </div>
                  @if (matchConfirmedAt(); as at) {
                    <p class="confirmed-at">Confirmed {{ at | date:'medium' }}</p>
                  }
                  <dl class="stack-meta compact">
                    <div><dt>Tracking</dt><dd>{{ p.trackingNumber || '—' }}</dd></div>
                    <div><dt>Current suite</dt><dd>{{ p.suiteNumber || 'Unmatched' }}</dd></div>
                  </dl>
                  <label class="field">
                    <span>Suite number to confirm</span>
                    <input [(ngModel)]="suiteNumber" name="suiteConfirm" (blur)="lookupSuite()" />
                  </label>
                  @if (suiteLookup(); as l) {
                    <div class="lookup-card" [class.blocked]="!l.canReceiveParcels">
                      <strong>{{ l.customerDisplayName }}</strong>
                      <span>{{ l.customerEmail }}</span>
                      <span>Suite {{ l.suiteNumber }} · {{ l.suiteAccessStatus }}</span>
                      @if (!l.canReceiveParcels) {
                        <p class="warn">{{ l.customerMessage }}</p>
                      }
                    </div>
                  }
                  @if (matchMsg()) { <p class="inline-ok">{{ matchMsg() }}</p> }
                  @if (matchErr()) { <p class="inline-err">{{ matchErr() }}</p> }
                  <div class="inline-actions">
                    <button
                      type="button"
                      class="ops-btn ops-btn-primary"
                      [disabled]="!suiteLookup()?.canReceiveParcels || matchBusy()"
                      (click)="confirmMatch()"
                    >
                      {{ matchBusy() ? 'Saving…' : 'Confirm suite match' }}
                    </button>
                  </div>
                </section>
              }
              @case ('inspection') {
                <section id="inspection-section" class="tab-section">
                  <h2 class="section-title">Parcel photos &amp; inspection</h2>
                  @if (photos().length) {
                    <div class="photo-grid">
                      @for (ph of photos(); track ph.photoId) {
                        <figure class="photo-tile">
                          @if (thumbUrls()[ph.photoId]) {
                            <img [src]="thumbUrls()[ph.photoId]" [alt]="ph.fileName" />
                          } @else {
                            <div class="photo-placeholder"></div>
                          }
                          <button
                            type="button"
                            class="photo-delete"
                            [disabled]="photoDeleteBusy() === ph.photoId"
                            (click)="deletePhoto(ph)"
                            aria-label="Delete photo"
                          >
                            <span class="material-icons-outlined">delete</span>
                          </button>
                        </figure>
                      }
                    </div>
                  }
                  <form class="inspection-form" (ngSubmit)="saveInspection()">
                    <div class="row2">
                      <label>
                        <span>Packaging type</span>
                        <select [(ngModel)]="packagingType" name="pkg">
                          @for (opt of packagingTypes; track opt) {
                            <option [value]="opt">{{ opt }}</option>
                          }
                        </select>
                      </label>
                      <label>
                        <span>Warehouse location</span>
                        <input [(ngModel)]="warehouseLocation" name="loc" placeholder="A1-02-03" />
                      </label>
                    </div>
                    @if (packagingType === 'Other') {
                      <label>
                        <span>Other packaging (describe)</span>
                        <input [(ngModel)]="packagingTypeOther" name="pkgOther" placeholder="e.g. Wooden crate" />
                      </label>
                    }
                    <label>
                      <span>Condition</span>
                      <select [(ngModel)]="conditionStatus" name="cond">
                        @for (opt of conditionOptions; track opt.value) {
                          <option [value]="opt.value">{{ opt.label }}</option>
                        }
                      </select>
                    </label>
                    <div class="checks">
                      <label><input type="checkbox" [(ngModel)]="outerPackagingIntact" name="c1" /> Outer packaging intact</label>
                      <label><input type="checkbox" [(ngModel)]="sealIntact" name="c2" /> Seal intact</label>
                      <label><input type="checkbox" [(ngModel)]="labelReadable" name="c3" /> Label readable</label>
                      <label><input type="checkbox" [(ngModel)]="goodsAsDescribed" name="c4" /> Goods as described</label>
                    </div>
                    <label>
                      <span>Inspection notes</span>
                      <textarea [(ngModel)]="inspectionNotes" name="notes" rows="4"></textarea>
                    </label>
                    <div class="inline-actions">
                      <label class="ops-btn ops-btn-outline upload-photo" [class.disabled]="photoUploadBusy()">
                        <span class="material-icons-outlined">add_a_photo</span>
                        {{ photoUploadBusy() ? 'Uploading…' : 'Add photo' }}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          hidden
                          [disabled]="photoUploadBusy()"
                          (change)="onPhotoSelected($event)"
                        />
                      </label>
                      <button type="submit" class="ops-btn ops-btn-primary" [disabled]="inspectionBusy()">
                        {{ inspectionBusy() ? 'Saving…' : 'Save inspection' }}
                      </button>
                    </div>
                    @if (inspectionMsg()) {
                      <p class="inline-ok">{{ inspectionMsg() }}</p>
                    }
                  </form>
                </section>
              }
              @case ('invoice') {
                <section id="invoice-section" class="tab-section">
                  <div class="section-head">
                    <h2 class="section-title">Invoice verification</h2>
                    <ops-pill [label]="p.invoiceStatus" [tone]="invoiceTone(p.invoiceStatus)" />
                  </div>
                  <div class="invoice-grid">
                    <div class="invoice-doc">
                      @if (!p.invoiceFileName) {
                        <p class="hint">Customer has not uploaded an invoice yet.</p>
                      } @else if (previewUrl()) {
                        @if (isPdf()) {
                          <iframe class="doc-frame" [src]="previewUrl()" title="Invoice document"></iframe>
                        } @else {
                          <img class="doc-img" [src]="previewUrl()!" alt="Invoice" />
                        }
                      } @else if (previewError()) {
                        <p class="inline-err">{{ previewError() }}</p>
                      } @else {
                        <nk-pulse-loader size="sm" [block]="false" label="Loading invoice…" />
                      }
                    </div>
                    <div class="invoice-meta">
                      <dl class="stack-meta compact">
                        <div><dt>File</dt><dd>{{ p.invoiceFileName || '—' }}</dd></div>
                        <div><dt>Declared value</dt><dd>{{ p.declaredValueZar != null ? 'R ' + p.declaredValueZar : '—' }}</dd></div>
                        <div><dt>Quote readiness</dt><dd>{{ p.quoteReadiness }}</dd></div>
                      </dl>
                      @if (p.readinessBlockers.length) {
                        <p class="hint">Blockers: {{ p.readinessBlockers.join(', ') }}</p>
                      }
                      @if (invoiceMsg()) { <p class="inline-ok">{{ invoiceMsg() }}</p> }
                      @if (invoiceErr()) { <p class="inline-err">{{ invoiceErr() }}</p> }
                      @if (canVerifyInvoice()) {
                        <div class="inline-actions">
                          <button
                            type="button"
                            class="ops-btn ops-btn-primary"
                            [disabled]="invoiceBusy() || !p.invoiceFileName"
                            (click)="approveInvoice()"
                          >
                            Approve invoice
                          </button>
                          <button
                            type="button"
                            class="ops-btn ops-btn-outline danger"
                            [disabled]="invoiceBusy() || !p.invoiceFileName"
                            (click)="rejectInvoice()"
                          >
                            Reject invoice
                          </button>
                        </div>
                      }
                    </div>
                  </div>
                </section>
              }
            }
          </div>
        </div>
      } @else if (!error()) {
        <nk-pulse-loader label="Loading parcel…" />
      }
    </div>
  `,
  styles: `
    .page { max-width: 1240px; margin: 0 auto; }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      color: var(--ops-link);
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 600;
      margin-bottom: 0.85rem;
    }
    .back-link .material-icons-outlined { font-size: 18px; }
    .page-head { margin-bottom: 1rem; }
    .page-head h1 { margin: 0 0 0.2rem; font-size: 1.35rem; font-weight: 700; }
    .subtitle { margin: 0; color: var(--ops-muted); font-size: 0.9rem; }
    .summary-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem 2rem;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
    }
    .sum-item { display: flex; flex-direction: column; gap: 0.3rem; min-width: 100px; }
    .sum-item .label {
      font-size: 0.68rem;
      color: var(--ops-muted);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .sum-item strong { font-size: 0.88rem; }
    .tab-shell { overflow: hidden; margin-bottom: 1rem; }
    .tab-bar {
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--ops-border);
      padding: 0 0.5rem;
      overflow-x: auto;
    }
    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.85rem 1rem;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--ops-muted);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      margin-bottom: -1px;
    }
    .tab-btn .material-icons-outlined { font-size: 18px; }
    .tab-btn:hover { color: var(--ops-link); background: var(--ops-primary-soft); }
    .tab-btn.active {
      color: var(--ops-link);
      border-bottom-color: var(--ops-link);
      background: var(--ops-primary-soft);
    }
    .tab-panel { min-height: 320px; }
    .tab-section { margin-bottom: 0; }
    .overview-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 760px) { .overview-grid { grid-template-columns: 1fr; } }
    .match-tab { max-width: 560px; }
    .invoice-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 1.25rem;
      align-items: start;
    }
    @media (max-width: 900px) { .invoice-grid { grid-template-columns: 1fr; } }
    .invoice-grid .doc-frame { min-height: 420px; margin-bottom: 0; }
    .section-title { margin: 0 0 0.85rem; font-size: 0.95rem; font-weight: 700; }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.65rem;
    }
    .section-head .section-title { margin: 0; }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.65rem 1.25rem;
      margin: 0;
      font-size: 0.85rem;
    }
    .meta-grid dt, .stack-meta dt { color: var(--ops-muted); font-weight: 600; font-size: 0.75rem; }
    .meta-grid dd, .stack-meta dd { margin: 0.1rem 0 0; }
    .stack-meta { display: flex; flex-direction: column; gap: 0.65rem; margin: 0; font-size: 0.85rem; }
    .stack-meta.compact { margin-bottom: 0.75rem; }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    @media (max-width: 560px) { .photo-grid { grid-template-columns: repeat(2, 1fr); } }
    .photo-grid img, .photo-placeholder {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: var(--ops-radius-sm);
      border: 1px solid var(--ops-border);
      background: var(--ops-bg);
    }
    .photo-tile {
      position: relative;
      margin: 0;
    }
    .photo-delete {
      position: absolute;
      top: 0.35rem;
      right: 0.35rem;
      width: 1.75rem;
      height: 1.75rem;
      border: none;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.72);
      color: #fff;
      display: grid;
      place-items: center;
      cursor: pointer;
      padding: 0;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .photo-tile:hover .photo-delete,
    .photo-tile:focus-within .photo-delete,
    .photo-delete:disabled {
      opacity: 1;
    }
    .photo-delete .material-icons-outlined { font-size: 16px; }
    .photo-delete:disabled { cursor: wait; opacity: 0.7; }
    .inspection-form label { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.75rem; font-size: 0.78rem; font-weight: 600; color: var(--ops-muted); }
    .inspection-form input, .inspection-form select, .inspection-form textarea, .field input {
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      font: inherit;
      color: var(--ops-text);
    }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    @media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
    .checks { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.75rem; }
    .checks label { flex-direction: row; align-items: center; gap: 0.45rem; font-weight: 500; color: var(--ops-text); }
    .inline-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; }
    .upload-photo { cursor: pointer; margin: 0; gap: 0.35rem; }
    .upload-photo.disabled { opacity: 0.65; pointer-events: none; }
    .upload-photo input { display: none; }
    .doc-frame { width: 100%; min-height: 220px; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); margin-bottom: 0.75rem; }
    .doc-img { width: 100%; max-height: 280px; object-fit: contain; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); margin-bottom: 0.75rem; }
    .lookup-card {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      padding: 0.65rem 0.75rem;
      margin-bottom: 0.65rem;
      background: var(--ops-success-soft);
      border: 1px solid #86efac;
      border-radius: var(--ops-radius-sm);
      font-size: 0.82rem;
    }
    .lookup-card.blocked { background: var(--ops-danger-soft); border-color: var(--ops-danger-border); }
    .warn { color: #991b1b; margin: 0.25rem 0 0; font-size: 0.78rem; }
    .confirmed-at { margin: 0 0 0.65rem; font-size: 0.78rem; color: #15803d; }
    .timeline { list-style: none; margin: 0; padding: 0; }
    .timeline li { display: grid; grid-template-columns: 12px 1fr; gap: 0.75rem; padding: 0.65rem 0; border-bottom: 1px solid var(--ops-border); }
    .timeline li:last-child { border-bottom: none; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--ops-brand-green, #15803d); margin-top: 0.35rem; }
    .dot-whatsapp { background: #25d366; }
    .timeline .detail { white-space: pre-wrap; }
    .when { display: block; font-size: 0.72rem; color: var(--ops-muted); margin-top: 0.15rem; }
    .detail { margin: 0.25rem 0 0; font-size: 0.82rem; }
    .hint { font-size: 0.82rem; color: var(--ops-muted); margin: 0; }
    .hint.pad { padding: 1rem 0; }
    .inline-ok { font-size: 0.82rem; color: #15803d; margin: 0.5rem 0 0; }
    .inline-err { font-size: 0.82rem; color: #b91c1c; margin: 0.5rem 0 0; }
    .err-banner {
      color: var(--ops-danger);
      background: var(--ops-danger-soft);
      border: 1px solid var(--ops-danger-border);
      border-radius: var(--ops-radius-sm);
      padding: 0.75rem 1rem;
      margin-bottom: 0.85rem;
    }
    .danger { color: #b91c1c; border-color: #fecaca; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.65rem; }
    .field span { font-size: 0.78rem; font-weight: 600; color: var(--ops-muted); }
  `,
})
export class ParcelDetailComponent implements OnInit, OnDestroy {
  readonly parcelId = input.required<string>();
  readonly routes = receivingRoutes;
  readonly detailTabs = DETAIL_TABS;
  readonly activeTab = signal<ParcelDetailTab>('overview');

  private readonly api = inject(ReceivingApiService);
  private readonly http = inject(HttpClient);
  private readonly session = inject(OpsSessionService);
  private readonly receiving = inject(OpsReceivingContextService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly overlay = inject(OpsOverlayService);

  readonly parcel = signal<OpsParcelDetailDto | null>(null);
  readonly activity = signal<OpsActivityItemDto[]>([]);
  readonly photos = signal<OpsPhotoDto[]>([]);
  readonly thumbUrls = signal<Record<string, string>>({});
  readonly error = signal<string | null>(null);
  readonly statusTone = pillToneForParcelStatus;
  readonly invoiceTone = pillToneForInvoice;
  readonly matchTone = pillToneForMatch;
  readonly packagingTypes = PACKAGING_TYPE_OPTIONS;
  readonly conditionOptions = CONDITION_OPTIONS;

  readonly inspectionBusy = signal(false);
  readonly photoUploadBusy = signal(false);
  readonly photoDeleteBusy = signal<string | null>(null);
  readonly inspectionMsg = signal<string | null>(null);
  readonly matchBusy = signal(false);
  readonly matchMsg = signal<string | null>(null);
  readonly matchErr = signal<string | null>(null);
  readonly invoiceBusy = signal(false);
  readonly invoiceMsg = signal<string | null>(null);
  readonly invoiceErr = signal<string | null>(null);
  readonly suiteLookup = signal<SuiteReceiveLookupDto | null>(null);
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewError = signal<string | null>(null);
  readonly contentType = signal('');

  suiteNumber = '';
  packagingType = 'Corrugated box';
  packagingTypeOther = '';
  warehouseLocation = '';
  conditionStatus = 'GOOD';
  outerPackagingIntact = true;
  sealIntact = true;
  labelReadable = true;
  goodsAsDescribed = true;
  inspectionNotes = '';

  private objectUrl: string | null = null;
  private thumbObjectUrls: string[] = [];

  readonly suiteMatchLabel = computed(() => {
    const p = this.parcel();
    if (!p?.suiteNumber) return 'No Match';
    if (!p.trackingNumber) return 'Partial Match';
    return 'Match';
  });

  readonly matchConfirmedAt = computed(() => {
    const hit = this.activity().find((e) => e.eventType === 'SUITE_MATCHED');
    return hit?.occurredAtUtc ?? null;
  });

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    for (const u of this.thumbObjectUrls) URL.revokeObjectURL(u);
  }

  canVerifyInvoice(): boolean {
    return this.session.can(OPS_CAP.invoiceVerify);
  }

  isPdf(): boolean {
    return this.contentType().includes('pdf');
  }

  quoteReadinessTone(readiness: string): OpsPillTone {
    const r = readiness.toUpperCase();
    if (r.includes('READY') && !r.includes('NOT')) return 'green';
    if (r.includes('NOT')) return 'red';
    return 'orange';
  }

  setTab(tab: ParcelDetailTab): void {
    this.activeTab.set(tab);
  }

  onPhotoSelected(event: Event): void {
    const key = this.session.opsKey();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!key || !file) return;
    this.photoUploadBusy.set(true);
    this.api.uploadPhoto(this.parcelId(), 'INSPECTION', file, key).subscribe({
      next: () => {
        this.photoUploadBusy.set(false);
        this.overlay.success('Inspection photo uploaded.');
        this.loadPhotos(key);
      },
      error: (err) => {
        this.photoUploadBusy.set(false);
        const msg = opsPhotoUploadError(err);
        this.overlay.error(msg);
      },
    });
    input.value = '';
  }

  deletePhoto(photo: OpsPhotoDto): void {
    void this.confirmDeletePhoto(photo);
  }

  private async confirmDeletePhoto(photo: OpsPhotoDto): Promise<void> {
    const key = this.session.opsKey();
    if (!key) return;
    const confirmed = await this.overlay.confirmDialog({
      title: 'Delete photo',
      message: `Remove "${photo.fileName}" from this inspection? This cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;
    this.photoDeleteBusy.set(photo.photoId);
    this.api.deletePhoto(photo.photoId, key).subscribe({
      next: () => {
        this.photoDeleteBusy.set(null);
        this.removePhotoFromView(photo.photoId);
        this.overlay.success('Photo deleted.');
      },
      error: (err) => {
        this.photoDeleteBusy.set(null);
        this.overlay.error(this.formatError(err));
      },
    });
  }

  private removePhotoFromView(photoId: string): void {
    const url = this.thumbUrls()[photoId];
    if (url) {
      URL.revokeObjectURL(url);
      this.thumbObjectUrls = this.thumbObjectUrls.filter((u) => u !== url);
    }
    this.photos.update((list) => list.filter((p) => p.photoId !== photoId));
    this.thumbUrls.update((m) => {
      const next = { ...m };
      delete next[photoId];
      return next;
    });
  }

  saveInspection(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.inspectionBusy.set(true);
    this.inspectionMsg.set(null);
    this.api
      .saveInspection(
        this.parcelId(),
        {
          conditionStatus: this.conditionStatus,
          warehouseLocation: this.warehouseLocation,
          packagingType: resolvePackagingTypeForSave(this.packagingType, this.packagingTypeOther),
          outerPackagingIntact: this.outerPackagingIntact,
          sealIntact: this.sealIntact,
          labelReadable: this.labelReadable,
          goodsAsDescribed: this.goodsAsDescribed,
          inspectionNotes: this.inspectionNotes,
        },
        key,
      )
      .subscribe({
        next: (r) => {
          this.inspectionBusy.set(false);
          this.inspectionMsg.set(`Inspection saved — readiness: ${r.quoteReadiness}`);
          this.reloadParcel(key);
        },
        error: (err) => {
          this.inspectionBusy.set(false);
          this.error.set(this.formatError(err));
        },
      });
  }

  lookupSuite(): void {
    const key = this.session.opsKey();
    if (!key || !this.suiteNumber.trim()) return;
    this.matchErr.set(null);
    this.api.lookupSuite(this.suiteNumber, key).subscribe({
      next: (l) => this.suiteLookup.set(l),
      error: (err) => this.matchErr.set(this.formatError(err)),
    });
  }

  confirmMatch(): void {
    const key = this.session.opsKey();
    if (!key || !this.suiteNumber.trim()) return;
    this.matchBusy.set(true);
    this.matchErr.set(null);
    this.matchMsg.set(null);
    this.api.confirmSuiteMatch(this.parcelId(), this.suiteNumber, key).subscribe({
      next: (res) => {
        this.matchBusy.set(false);
        this.matchMsg.set(res.message);
        this.receiving.refreshStats();
        this.reloadParcel(key);
      },
      error: (err) => {
        this.matchBusy.set(false);
        this.matchErr.set(this.formatError(err));
      },
    });
  }

  approveInvoice(): void {
    void this.verifyInvoice('APPROVE');
  }

  rejectInvoice(): void {
    void this.verifyInvoice('REJECT');
  }

  private reload(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.error.set(null);
    this.api.getParcel(this.parcelId(), key).subscribe({
      next: (p) => {
        this.parcel.set(p);
        this.applyInspection(p);
        this.suiteNumber = p.suiteNumber;
        if (p.invoiceFileName) this.loadPreview(key);
        this.loadPhotos(key);
      },
      error: (err) => this.error.set(this.formatError(err)),
    });
    this.api.listActivity(this.parcelId(), key).subscribe({
      next: (events) => this.activity.set(events),
    });
  }

  private reloadParcel(key: string): void {
    this.api.getParcel(this.parcelId(), key).subscribe({
      next: (p) => {
        this.parcel.set(p);
        this.applyInspection(p);
      },
    });
    this.api.listActivity(this.parcelId(), key).subscribe({
      next: (events) => this.activity.set(events),
    });
  }

  private applyInspection(p: OpsParcelDetailDto): void {
    if (!p.inspection) return;
    const packaging = splitPackagingTypeFromApi(p.inspection.packagingType);
    this.packagingType = packaging.type;
    this.packagingTypeOther = packaging.otherDetail;
    this.warehouseLocation = p.inspection.warehouseLocation ?? '';
    this.conditionStatus = p.inspection.conditionStatus;
    this.outerPackagingIntact = p.inspection.outerPackagingIntact;
    this.sealIntact = p.inspection.sealIntact;
    this.labelReadable = p.inspection.labelReadable;
    this.goodsAsDescribed = p.inspection.goodsAsDescribed;
    this.inspectionNotes = p.inspection.inspectionNotes ?? '';
  }

  private loadPhotos(key: string): void {
    this.api.listPhotos(this.parcelId(), key, 'INSPECTION').subscribe({
      next: (list) => {
        this.photos.set(list);
        for (const ph of list) {
          if (this.thumbUrls()[ph.photoId]) continue;
          this.http
            .get(this.api.photoFileUrl(ph.photoId, key), {
              headers: this.api.photoHeaders(key),
              responseType: 'blob',
            })
            .subscribe((blob) => {
              const url = URL.createObjectURL(blob);
              this.thumbObjectUrls.push(url);
              this.thumbUrls.update((m) => ({ ...m, [ph.photoId]: url }));
            });
        }
      },
    });
  }

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

  private async verifyInvoice(decision: 'APPROVE' | 'REJECT'): Promise<void> {
    const key = this.session.opsKey();
    if (!key) return;
    let reason: string | undefined;
    if (decision === 'REJECT') {
      const prompted = await this.overlay.requestInvoiceRejectionReason();
      if (!prompted) return;
      reason = prompted;
    }
    this.invoiceBusy.set(true);
    this.invoiceErr.set(null);
    this.api.verifyInvoice(this.parcelId(), { decision, reason }, key).subscribe({
      next: (r) => {
        this.invoiceBusy.set(false);
        this.invoiceMsg.set(r.message);
        this.overlay.success(r.message);
        this.reloadParcel(key);
      },
      error: (err) => {
        this.invoiceBusy.set(false);
        const msg = this.formatError(err);
        this.invoiceErr.set(msg);
        this.overlay.error(msg);
      },
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | null;
      if (body?.detail) return body.detail;
      if (body?.title) return body.title;
    }
    return 'Request failed.';
  }
}
