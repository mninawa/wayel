import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { BarcodeScanService } from '../../services/barcode-scan.service';
import { type ShippingLabelExtraction } from '../../services/shipping-label-extract.service';
import { OPS_CAP } from '../../services/ops-permissions';
import {
  ReceivingApiService,
  type OpsParcelDetailDto,
  type ReceiveParcelResultDto,
  type SuiteReceiveLookupDto,
} from '../../services/receiving-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { OpsLabelReaderComponent } from '../../shared/ops-label-reader.component';
import { OpsPillComponent, pillToneForInvoice } from '../../shared/ops-pill.component';
import {
  CONDITION_OPTIONS,
  PACKAGING_TYPE_OPTIONS,
  resolvePackagingTypeForSave,
} from '../../shared/ops-inspection-options';
import {
  DEFAULT_CATEGORY_ID,
  DEFAULT_SUBCATEGORY_ID,
  formatProductCategory,
} from '../../types/ecommerce-product-categories';
import { receivingRoutes } from '../../types/receiving.types';
import { OpsOverlayService } from '../../shared/ops-overlay.service';
import {
  isRetailerOption,
  RETAILER_OPTIONS,
  retailerBadgeLetter,
} from '../../types/retailer-options';

const STEPS = ['Scan', 'Match', 'Capture Details', 'Invoice', 'Confirm'] as const;

const RECENT_SCANS_KEY = 'weyell-ops-recent-scans';
const MAX_RECENT = 8;

interface RecentScan {
  trackingNumber: string;
  retailer: string;
  scannedAt: number;
}

interface PendingPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

@Component({
  selector: 'ops-parcel-receive',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink, OpsLabelReaderComponent, OpsPillComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a [routerLink]="routes.dashboard" class="back-link">
        <span class="material-icons-outlined">arrow_back</span>
        Back to Receiving Queue
      </a>

      <header class="page-head">
        <div>
          <h1>Receive New Parcel</h1>
          <p>Scan, match, inspect and verify incoming parcels.</p>
        </div>
        @if (receivedDisplayId()) {
          <span class="ref-id">{{ receivedDisplayId() }}</span>
        }
      </header>

      <ol class="stepper" aria-label="Receive steps">
        @for (label of steps; track label; let i = $index) {
          <li [class.active]="step() === i" [class.done]="step() > i || (i === 4 && step() === 4 && receivedResult())">
            <span class="step-dot">{{ i + 1 }}</span>
            <span class="step-label">{{ label }}</span>
          </li>
        }
      </ol>

      @if (step() === 0) {
        <div class="layout">
          <section class="ops-card ops-card-pad main-panel">
            <h2 class="panel-title">Scan</h2>
            <p class="panel-lead">Upload a label photo or enter tracking details manually.</p>

            <ops-label-reader
              #labelReader
              (extracted)="onLabelExtracted($event)"
              (readError)="scanError.set($event)"
              (readingChange)="labelReading.set($event)"
            />

            <label class="field">
              <span>Courier / Source</span>
              <div class="select-wrap">
                <span class="select-badge retailer" aria-hidden="true">{{ retailerBadge(retailer) }}</span>
                <select [(ngModel)]="retailer" name="retailer">
                  @for (r of retailers; track r) {
                    <option [value]="r">{{ r }}</option>
                  }
                </select>
              </div>
            </label>

            <label class="field">
              <span>Tracking Number</span>
              <div class="tracking-row">
                <input
                  #trackingInput
                  [(ngModel)]="trackingNumber"
                  name="tracking"
                  placeholder="1Z999AA1234567890"
                  [readonly]="labelReading()"
                  (keydown.enter)="onTrackingWedge($event)"
                />
                <button type="button" class="ops-btn ops-btn-outline scan-btn" (click)="openLabelScan()">
                  <span class="material-icons-outlined">photo_camera</span>
                  Camera
                </button>
              </div>
            </label>

            @if (scanError()) {
              <p class="err" role="alert">{{ scanError() }}</p>
            }

            <div class="panel-footer">
              <button
                type="button"
                class="ops-btn ops-btn-primary full-width"
                (click)="nextFromScan()"
                [disabled]="!canContinueScan()"
              >
                Continue to match
                <span class="material-icons-outlined">arrow_forward</span>
              </button>
            </div>
          </section>

          <aside class="side-col">
            <section class="ops-card ops-card-pad">
              <h3 class="side-title">Tips</h3>
              <ul class="tips-list">
                <li>Ensure the label is clear and well lit.</li>
                <li>Scan the barcode on the shipping label.</li>
                <li>Correct any field before continuing.</li>
              </ul>
            </section>
            <section class="ops-card ops-card-pad">
              <div class="side-head">
                <h3 class="side-title">Recent scans</h3>
                @if (recentScans().length > 3) {
                  <button type="button" class="link-btn" (click)="showAllRecent.set(!showAllRecent())">
                    {{ showAllRecent() ? 'Less' : 'View all' }}
                  </button>
                }
              </div>
              @if (recentScans().length === 0) {
                <p class="hint">Scans from this device appear here.</p>
              } @else {
                <ul class="recent-list">
                  @for (item of visibleRecent(); track item.scannedAt + item.trackingNumber) {
                    <li>
                      <button type="button" class="recent-item" (click)="applyRecent(item)">
                        <strong>{{ item.trackingNumber || 'No tracking' }}</strong>
                        <span>{{ item.retailer }}</span>
                        <span class="recent-time">{{ relativeTime(item.scannedAt) }}</span>
                      </button>
                    </li>
                  }
                </ul>
              }
            </section>
          </aside>
        </div>
      }

      @if (step() === 1) {
        <section class="match-grid">
          <article class="ops-card ops-card-pad">
            <h2 class="panel-title">Parcel information</h2>
            <dl class="info-list">
              <div><dt>Tracking number</dt><dd>{{ trackingNumber || '—' }}</dd></div>
              <div><dt>Current suite</dt><dd>{{ suiteNumber || '—' }}</dd></div>
              <div><dt>Courier / source</dt><dd>{{ retailer }}</dd></div>
            </dl>
          </article>

          <article class="ops-card ops-card-pad">
            <h2 class="panel-title">Customer &amp; suite</h2>
            <label class="field">
              <span>Suite number</span>
              <input
                [(ngModel)]="suiteNumber"
                name="suiteNumber"
                placeholder="WY-019E4AE2"
                (blur)="lookupSuite()"
              />
            </label>
            @if (lookupLoading()) {
              <p class="hint">Looking up customer…</p>
            }
            @if (suiteLookup(); as lookup) {
              <div class="customer-card">
                <strong>{{ lookup.customerDisplayName }}</strong>
                @if (lookup.canReceiveParcels) {
                  <ops-pill label="Active customer" tone="green" />
                }
                <span>{{ lookup.customerEmail }}</span>
              </div>
              @if (!lookup.canReceiveParcels) {
                <p class="err">{{ lookup.customerMessage }}</p>
              }
            }
            @if (suiteLookupError()) {
              <p class="err">{{ suiteLookupError() }}</p>
            }
          </article>

          <article class="ops-card ops-card-pad match-summary">
            <h2 class="panel-title">Match summary</h2>
            @if (suiteLookup(); as lookup) {
              <dl class="info-list">
                <div><dt>Suite</dt><dd>{{ lookup.suiteNumber }}</dd></div>
                <div><dt>Customer</dt><dd>{{ lookup.customerDisplayName }}</dd></div>
                <div><dt>Tracking</dt><dd>{{ trackingNumber || '—' }}</dd></div>
              </dl>
            } @else {
              <p class="hint">Enter a suite number to preview the match.</p>
            }
          </article>
        </section>

        <div class="step-footer">
          <button type="button" class="ops-btn ops-btn-ghost" (click)="step.set(0)">Back</button>
          <button
            type="button"
            class="ops-btn ops-btn-primary"
            (click)="nextFromMatch()"
            [disabled]="!suiteLookup()?.canReceiveParcels"
          >
            Confirm match
            <span class="material-icons-outlined">arrow_forward</span>
          </button>
        </div>
      }

      @if (step() === 2) {
        <section class="capture-grid">
          <article class="ops-card ops-card-pad">
            <h2 class="panel-title">Inspection details</h2>
            <label class="field">
              <span>Parcel description *</span>
              <input [(ngModel)]="itemName" name="itemName" placeholder="Wireless headphones - Black" />
            </label>
            <div class="row2">
              <label class="field">
                <span>Packaging type</span>
                <select [(ngModel)]="packagingType" name="pkg">
                  @for (opt of packagingTypes; track opt) {
                    <option [value]="opt">{{ opt }}</option>
                  }
                </select>
              </label>
              @if (packagingType === 'Other') {
                <label class="field">
                  <span>Other packaging (describe)</span>
                  <input [(ngModel)]="packagingTypeOther" name="pkgOther" placeholder="e.g. Wooden crate" />
                </label>
              }
              <label class="field">
                <span>Condition</span>
                <select [(ngModel)]="conditionStatus" name="cond">
                  @for (opt of conditionOptions; track opt.value) {
                    <option [value]="opt.value">{{ opt.label }}</option>
                  }
                </select>
              </label>
            </div>
            <label class="field">
              <span>Warehouse location</span>
              <input [(ngModel)]="warehouseLocation" name="loc" placeholder="A1-02-03" />
            </label>
            <div class="checks">
              <label><input type="checkbox" [(ngModel)]="outerPackagingIntact" name="c1" /> Outer packaging intact</label>
              <label><input type="checkbox" [(ngModel)]="sealIntact" name="c2" /> Seal intact</label>
              <label><input type="checkbox" [(ngModel)]="labelReadable" name="c3" /> Label readable</label>
              <label><input type="checkbox" [(ngModel)]="goodsAsDescribed" name="c4" /> Goods as described</label>
            </div>
            <div class="row2">
              <label class="field">
                <span>Weight (kg)</span>
                <input type="number" step="0.01" min="0" [(ngModel)]="weightKg" name="weightKg" />
              </label>
              <label class="field">
                <span>Declared value (ZAR)</span>
                <input type="number" step="0.01" min="0" [(ngModel)]="declaredValueZar" name="value" />
              </label>
            </div>
            <label class="field">
              <span>Dimensions</span>
              <input [(ngModel)]="dimensionsLabel" name="dims" placeholder="28 x 18 x 9 cm" />
            </label>
          </article>

          <article class="ops-card ops-card-pad">
            <h2 class="panel-title">Inspection notes</h2>
            <label class="field notes-field">
              <textarea [(ngModel)]="inspectionNotes" name="notes" rows="6" placeholder="Note any damage, repackaging, or discrepancies…"></textarea>
            </label>

            <h3 class="sub-title">Inspection photos</h3>
            <div class="photo-zone">
              @for (ph of pendingPhotos(); track ph.id) {
                <figure class="photo-thumb">
                  <img [src]="ph.previewUrl" [alt]="ph.file.name" />
                  <button type="button" class="remove-photo" (click)="removePendingPhoto(ph.id)" aria-label="Remove photo">×</button>
                </figure>
              }
              <label class="upload-zone">
                <span class="material-icons-outlined">add_a_photo</span>
                <span>Add photo</span>
                <small>JPEG, PNG or WebP · max 10MB</small>
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden (change)="onInspectionPhoto($event)" />
              </label>
            </div>
          </article>
        </section>

        @if (error()) {
          <p class="err banner" role="alert">{{ error() }}</p>
        }

        <div class="step-footer">
          <button type="button" class="ops-btn ops-btn-ghost" (click)="step.set(1)" [disabled]="busy()">Back</button>
          <button type="button" class="ops-btn ops-btn-primary" (click)="saveAndContinue()" [disabled]="busy() || !canCapture()">
            {{ busy() ? 'Saving…' : 'Save & continue' }}
            <span class="material-icons-outlined">arrow_forward</span>
          </button>
        </div>
      }

      @if (step() === 3) {
        <section class="invoice-grid">
          <article class="ops-card ops-card-pad">
            <h2 class="panel-title">Invoice document</h2>
            @if (receivedParcel(); as p) {
              @if (!p.invoiceFileName) {
                <div class="awaiting-invoice">
                  <span class="material-icons-outlined">upload_file</span>
                  <p>No invoice on file yet.</p>
                  @if (canUploadInvoice()) {
                    <label class="invoice-upload-zone" [class.uploading]="invoiceUploadBusy()">
                      <span class="material-icons-outlined">upload</span>
                      <strong>{{ invoiceUploadBusy() ? 'Uploading…' : 'Upload invoice' }}</strong>
                      <small>PDF, JPEG, PNG or WebP · max 25MB</small>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        hidden
                        [disabled]="invoiceUploadBusy()"
                        (change)="onInvoiceSelected($event)"
                      />
                    </label>
                    <p class="hint">{{ invoiceReminderHint() }}</p>
                    @if (canResendInvoiceReminder()) {
                      <button
                        type="button"
                        class="ops-btn ops-btn-outline resend-reminder-btn"
                        [disabled]="invoiceReminderBusy()"
                        (click)="resendInvoiceReminder()"
                      >
                        {{ invoiceReminderBusy() ? 'Sending…' : 'Resend WhatsApp reminder' }}
                      </button>
                    }
                  } @else {
                    <p class="hint">{{ invoiceReminderHint() }}</p>
                    @if (canResendInvoiceReminder()) {
                      <button
                        type="button"
                        class="ops-btn ops-btn-outline resend-reminder-btn"
                        [disabled]="invoiceReminderBusy()"
                        (click)="resendInvoiceReminder()"
                      >
                        {{ invoiceReminderBusy() ? 'Sending…' : 'Resend WhatsApp reminder' }}
                      </button>
                    }
                  }
                </div>
              } @else if (previewUrl()) {
                @if (isPdf()) {
                  <iframe class="doc-frame" [src]="previewUrl()" title="Invoice document"></iframe>
                } @else {
                  <img class="doc-img" [src]="previewUrl()!" alt="Invoice" />
                }
              } @else if (previewError()) {
                <p class="err">{{ previewError() }}</p>
              } @else {
                <p class="hint">Loading invoice…</p>
              }
            }
          </article>

          <article class="ops-card ops-card-pad">
            <h2 class="panel-title">Invoice details</h2>
            @if (receivedParcel(); as p) {
              <dl class="info-list">
                <div><dt>Invoice file</dt><dd>{{ p.invoiceFileName || '—' }}</dd></div>
                <div><dt>Declared value</dt><dd>{{ p.declaredValueZar != null ? 'R ' + p.declaredValueZar : '—' }}</dd></div>
                <div><dt>Quote readiness</dt><dd>{{ p.quoteReadiness }}</dd></div>
              </dl>
              @if (p.readinessBlockers.length) {
                <p class="hint">Blockers: {{ p.readinessBlockers.join(', ') }}</p>
              }
              @if (invoiceMsg()) { <p class="ok">{{ invoiceMsg() }}</p> }
              @if (invoiceErr()) { <p class="err">{{ invoiceErr() }}</p> }
            }
          </article>
        </section>

        <div class="step-footer">
          <button type="button" class="ops-btn ops-btn-ghost" (click)="step.set(2)" [disabled]="invoiceBusy()">Back</button>
          @if (canVerifyInvoice() && receivedParcel()?.invoiceFileName) {
            <button type="button" class="ops-btn ops-btn-outline danger" [disabled]="invoiceBusy()" (click)="rejectInvoice()">
              Request changes
            </button>
            <button type="button" class="ops-btn ops-btn-primary" [disabled]="invoiceBusy()" (click)="approveInvoice()">
              Approve invoice
              <span class="material-icons-outlined">arrow_forward</span>
            </button>
          } @else {
            <button type="button" class="ops-btn ops-btn-primary" (click)="finishWithoutInvoice()">
              Continue to confirm
              <span class="material-icons-outlined">arrow_forward</span>
            </button>
          }
        </div>
      }

      @if (step() === 4 && receivedResult(); as r) {
        <section class="confirm-grid">
          <article class="ops-card ops-card-pad success-panel">
            <div class="success-icon">
              <span class="material-icons-outlined">check_circle</span>
            </div>
            <h2>Parcel recorded successfully!</h2>
            <dl class="info-list success-meta">
              <div><dt>Tracking</dt><dd>{{ r.trackingNumber || '—' }}</dd></div>
              <div><dt>Suite</dt><dd>{{ r.suiteNumber }}</dd></div>
              <div><dt>Customer</dt><dd>{{ r.customerDisplayName }}</dd></div>
              <div><dt>Received on</dt><dd>{{ r.receivedAtUtc | date:'medium' }}</dd></div>
            </dl>
            <div class="confirm-actions">
              <a [routerLink]="routes.parcel(r.parcelId)" class="ops-btn ops-btn-outline">View parcel details</a>
              <a [routerLink]="routes.dashboard" class="ops-btn ops-btn-primary">Back to overview</a>
            </div>
          </article>

          <article class="ops-card ops-card-pad">
            <h2 class="panel-title">What's next?</h2>
            <ul class="checklist">
              <li [class.done]="inspectionSaved()">
                <span class="material-icons-outlined">{{ inspectionSaved() ? 'check_circle' : 'radio_button_unchecked' }}</span>
                Inspection completed
              </li>
              <li [class.done]="invoiceVerified()">
                <span class="material-icons-outlined">{{ invoiceVerified() ? 'check_circle' : 'radio_button_unchecked' }}</span>
                Invoice verified
              </li>
              <li [class.done]="quoteReady()">
                <span class="material-icons-outlined">{{ quoteReady() ? 'check_circle' : 'radio_button_unchecked' }}</span>
                Ready for quote
              </li>
            </ul>
            <button type="button" class="ops-btn ops-btn-ghost receive-another" (click)="receiveAnother()">
              Receive another parcel
            </button>
          </article>
        </section>
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
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .page-head h1 { margin: 0 0 0.3rem; font-size: 1.45rem; font-weight: 700; }
    .page-head p { margin: 0; color: var(--ops-muted); font-size: 0.9rem; }
    .ref-id {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--ops-muted);
      background: var(--ops-bg);
      border: 1px solid var(--ops-border);
      padding: 0.35rem 0.65rem;
      border-radius: var(--ops-radius-sm);
    }
    .stepper {
      list-style: none;
      margin: 0 0 1.5rem;
      padding: 0;
      display: flex;
      gap: 0;
      counter-reset: step;
    }
    .stepper li {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.45rem;
      position: relative;
      color: var(--ops-muted);
      text-align: center;
    }
    .stepper li:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 14px;
      left: calc(50% + 18px);
      right: calc(-50% + 18px);
      height: 2px;
      background: var(--ops-border);
      z-index: 0;
    }
    .stepper li.done:not(:last-child)::after { background: var(--ops-primary); }
    .step-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 2px solid var(--ops-border);
      background: #fff;
      display: grid;
      place-items: center;
      font-size: 0.75rem;
      font-weight: 700;
      z-index: 1;
    }
    .stepper li.active .step-dot {
      border-color: var(--ops-link);
      background: var(--ops-primary);
      color: #fff;
    }
    .stepper li.done .step-dot {
      border-color: var(--ops-link);
      background: var(--ops-primary-soft);
      color: var(--ops-link);
    }
    .step-label { font-size: 0.78rem; font-weight: 600; }
    .stepper li.active .step-label { color: var(--ops-link); font-weight: 700; }
    .layout { display: grid; grid-template-columns: 1fr 300px; gap: 1rem; align-items: start; }
    @media (max-width: 960px) { .layout { grid-template-columns: 1fr; } }
    .panel-title { margin: 0 0 0.35rem; font-size: 1rem; font-weight: 700; }
    .panel-lead { margin: 0 0 1rem; font-size: 0.85rem; color: var(--ops-muted); }
    .sub-title { margin: 1rem 0 0.65rem; font-size: 0.9rem; font-weight: 700; }
    .field { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.9rem; }
    .field span { font-size: 0.78rem; font-weight: 600; color: var(--ops-muted); }
    .field input, .field select, .field textarea {
      padding: 0.6rem 0.75rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      font: inherit;
      width: 100%;
    }
    .notes-field { margin-bottom: 0; }
    .select-wrap {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      padding-left: 0.5rem;
      background: #fff;
    }
    .select-wrap select { border: none; padding-left: 0.25rem; flex: 1; }
    .select-badge {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: #232f3e;
      color: #ff9900;
      font-size: 0.55rem;
      font-weight: 800;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }
    .tracking-row { display: flex; gap: 0.5rem; }
    .tracking-row input { flex: 1; min-width: 0; }
    .scan-btn { flex-shrink: 0; gap: 0.35rem; white-space: nowrap; }
    .scan-btn .material-icons-outlined { font-size: 18px; }
    .panel-footer { margin-top: 0.5rem; }
    .full-width { width: 100%; justify-content: center; }
    .full-width .material-icons-outlined { font-size: 18px; }
    .side-title { margin: 0; font-size: 0.9rem; font-weight: 700; }
    .side-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem; }
    .tips-list { margin: 0; padding-left: 1.1rem; font-size: 0.82rem; color: var(--ops-muted); }
    .tips-list li { margin: 0.35rem 0; }
    .link-btn { border: none; background: none; color: var(--ops-link); font-size: 0.78rem; font-weight: 600; padding: 0; cursor: pointer; }
    .recent-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
    .recent-item {
      width: 100%;
      text-align: left;
      border: 1px solid var(--ops-border);
      border-radius: var(--ops-radius-sm);
      padding: 0.65rem 0.75rem;
      background: var(--ops-bg);
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      font: inherit;
      cursor: pointer;
    }
    .recent-item:hover { border-color: var(--ops-link); background: var(--ops-primary-soft); }
    .recent-item strong { font-size: 0.82rem; }
    .recent-item span { font-size: 0.75rem; color: var(--ops-muted); }
    .recent-time { font-size: 0.72rem !important; }
    .hint { font-size: 0.82rem; color: var(--ops-muted); margin: 0; }
    .match-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1rem;
      margin-bottom: 1rem;
    }
    @media (max-width: 900px) { .match-grid { grid-template-columns: 1fr; } }
    .info-list { margin: 0; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.65rem; }
    .info-list dt { color: var(--ops-muted); font-size: 0.75rem; font-weight: 600; }
    .info-list dd { margin: 0.1rem 0 0; }
    .customer-card {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      padding: 0.75rem;
      background: var(--ops-bg);
      border-radius: var(--ops-radius-sm);
      border: 1px solid var(--ops-border);
      font-size: 0.85rem;
    }
    .match-summary { background: var(--ops-primary-soft); border-color: rgba(132, 94, 194, 0.25); }
    .capture-grid, .invoice-grid, .confirm-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    @media (max-width: 900px) { .capture-grid, .invoice-grid, .confirm-grid { grid-template-columns: 1fr; } }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    @media (max-width: 560px) { .row2 { grid-template-columns: 1fr; } }
    .checks { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .checks label { display: flex; align-items: center; gap: 0.45rem; font-size: 0.85rem; }
    .photo-zone {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: 0.5rem;
    }
    .photo-thumb { position: relative; margin: 0; }
    .photo-thumb img {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: var(--ops-radius-sm);
      border: 1px solid var(--ops-border);
    }
    .remove-photo {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 50%;
      background: rgba(0,0,0,0.55);
      color: #fff;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
    }
    .upload-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      min-height: 100px;
      border: 2px dashed var(--ops-border);
      border-radius: var(--ops-radius-sm);
      padding: 0.75rem;
      text-align: center;
      font-size: 0.78rem;
      color: var(--ops-muted);
      cursor: pointer;
    }
    .upload-zone .material-icons-outlined { color: var(--ops-link); font-size: 24px; }
    .upload-zone input { display: none; }
    .upload-zone small { font-size: 0.68rem; }
    .step-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 0.65rem;
      flex-wrap: wrap;
      padding-top: 0.5rem;
      border-top: 1px solid var(--ops-border);
    }
    .step-footer .ops-btn-primary .material-icons-outlined { font-size: 18px; }
    .doc-frame { width: 100%; min-height: 420px; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); }
    .doc-img { width: 100%; max-height: 420px; object-fit: contain; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); }
    .awaiting-invoice {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--ops-muted);
    }
    .awaiting-invoice .material-icons-outlined { font-size: 2.5rem; opacity: 0.45; display: block; margin-bottom: 0.5rem; }
    .invoice-upload-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      margin: 1rem auto 0.75rem;
      max-width: 280px;
      padding: 1rem;
      border: 2px dashed var(--ops-border);
      border-radius: var(--ops-radius-sm);
      cursor: pointer;
      color: var(--ops-text);
      background: #fff;
    }
    .invoice-upload-zone.uploading { opacity: 0.65; pointer-events: none; }
    .invoice-upload-zone input { display: none; }
    .invoice-upload-zone .material-icons-outlined { color: var(--ops-link); font-size: 28px; }
    .invoice-upload-zone small { font-size: 0.68rem; color: var(--ops-muted); }
    .resend-reminder-btn { margin-top: 0.75rem; }
    .success-panel { text-align: center; }
    .success-icon .material-icons-outlined { font-size: 3.5rem; color: #15803d; }
    .success-panel h2 { margin: 0.5rem 0 1rem; font-size: 1.25rem; }
    .success-meta { text-align: left; margin-bottom: 1.25rem; }
    .confirm-actions { display: flex; flex-wrap: wrap; gap: 0.65rem; justify-content: center; }
    .checklist { list-style: none; margin: 0 0 1rem; padding: 0; display: flex; flex-direction: column; gap: 0.65rem; }
    .checklist li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.88rem;
      color: var(--ops-muted);
    }
    .checklist li.done { color: var(--ops-text); font-weight: 600; }
    .checklist .material-icons-outlined { font-size: 20px; color: var(--ops-border); }
    .checklist li.done .material-icons-outlined { color: #15803d; }
    .receive-another { width: 100%; justify-content: center; }
    .err { color: #b91c1c; font-size: 0.85rem; margin: 0 0 0.75rem; }
    .err.banner { padding: 0.75rem; background: var(--ops-danger-soft); border-radius: var(--ops-radius-sm); }
    .ok { font-size: 0.82rem; color: #15803d; margin: 0.5rem 0 0; }
    .danger { color: #b91c1c; border-color: #fecaca; }
    .side-col { display: flex; flex-direction: column; gap: 1rem; }
  `,
})
export class ParcelReceiveComponent implements OnDestroy {
  private readonly api = inject(ReceivingApiService);
  private readonly session = inject(OpsSessionService);
  private readonly barcodeScan = inject(BarcodeScanService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly overlay = inject(OpsOverlayService);
  private readonly trackingInput = viewChild<ElementRef<HTMLInputElement>>('trackingInput');
  private readonly labelReader = viewChild<OpsLabelReaderComponent>('labelReader');

  readonly routes = receivingRoutes;
  readonly steps = STEPS;
  readonly retailers = RETAILER_OPTIONS;
  readonly invoiceTone = pillToneForInvoice;
  readonly packagingTypes = PACKAGING_TYPE_OPTIONS;
  readonly conditionOptions = CONDITION_OPTIONS;

  readonly step = signal(0);
  readonly busy = signal(false);
  readonly lookupLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly scanError = signal<string | null>(null);
  readonly suiteLookupError = signal<string | null>(null);
  readonly suiteLookup = signal<SuiteReceiveLookupDto | null>(null);
  readonly receivedResult = signal<ReceiveParcelResultDto | null>(null);
  readonly receivedParcel = signal<OpsParcelDetailDto | null>(null);
  readonly receivedDisplayId = signal<string | null>(null);
  readonly labelReading = signal(false);
  readonly recentScans = signal<RecentScan[]>(this.loadRecentScans());
  readonly showAllRecent = signal(false);
  readonly pendingPhotos = signal<PendingPhoto[]>([]);
  readonly inspectionSaved = signal(false);
  readonly invoiceVerified = signal(false);
  readonly invoiceBusy = signal(false);
  readonly invoiceUploadBusy = signal(false);
  readonly invoiceMsg = signal<string | null>(null);
  readonly invoiceErr = signal<string | null>(null);
  readonly invoiceReminderStatus = signal<string | null>(null);
  readonly invoiceReminderDetail = signal<string | null>(null);
  readonly invoiceReminderBusy = signal(false);
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewError = signal<string | null>(null);
  readonly contentType = signal('');

  retailer = 'Takealot';
  suiteNumber = '';
  trackingNumber = '';
  itemName = '';
  categoryId = DEFAULT_CATEGORY_ID;
  subcategoryId = DEFAULT_SUBCATEGORY_ID;
  weightKg: number | null = null;
  declaredValueZar: number | null = null;
  dimensionsLabel = '';
  packagingType = 'Corrugated box';
  packagingTypeOther = '';
  warehouseLocation = '';
  conditionStatus = 'GOOD';
  outerPackagingIntact = true;
  sealIntact = true;
  labelReadable = true;
  goodsAsDescribed = true;
  inspectionNotes = '';

  private invoiceObjectUrl: string | null = null;

  readonly visibleRecent = () => {
    const all = this.recentScans();
    return this.showAllRecent() ? all : all.slice(0, 3);
  };

  ngOnDestroy(): void {
    this.revokePendingPhotos();
    if (this.invoiceObjectUrl) URL.revokeObjectURL(this.invoiceObjectUrl);
  }

  retailerBadge(retailer: string): string {
    return retailerBadgeLetter(retailer);
  }

  quoteReady(): boolean {
    const r = this.receivedParcel()?.quoteReadiness ?? '';
    return r.toUpperCase().includes('READY') && !r.toUpperCase().includes('NOT');
  }

  canVerifyInvoice(): boolean {
    return this.session.can(OPS_CAP.invoiceVerify);
  }

  canUploadInvoice(): boolean {
    return this.session.can(OPS_CAP.invoiceUpload);
  }

  canResendInvoiceReminder(): boolean {
    return !this.receivedParcel()?.invoiceFileName;
  }

  invoiceReminderHint(): string {
    const status = this.invoiceReminderStatus();
    const detail = this.invoiceReminderDetail();
    switch (status) {
      case 'Sent':
        return 'WhatsApp sent — customer asked to upload their purchase invoice from the portal.';
      case 'AlreadySent':
        return 'Customer was already reminded via WhatsApp to upload their invoice.';
      case 'Skipped':
        return detail ?? 'WhatsApp reminder was not sent — customer has no phone on profile.';
      case 'Failed':
        return detail ?? 'WhatsApp reminder failed. Use resend or ask the customer to upload manually.';
      case 'NotNeeded':
        return 'Invoice already on file.';
      default:
        return 'Waiting for the customer to upload their purchase invoice from the portal.';
    }
  }

  resendInvoiceReminder(): void {
    const key = this.session.opsKey();
    const parcelId = this.receivedResult()?.parcelId;
    if (!key || !parcelId || this.invoiceReminderBusy()) return;

    this.invoiceReminderBusy.set(true);
    this.api.sendInvoiceUploadReminder(parcelId, key, true).subscribe({
      next: (result) => {
        this.invoiceReminderBusy.set(false);
        this.applyInvoiceReminderFeedback(
          result.invoiceReminderWhatsAppStatus,
          result.invoiceReminderWhatsAppDetail,
        );
        this.overlay.success(result.message);
      },
      error: (err: unknown) => {
        this.invoiceReminderBusy.set(false);
        this.overlay.error(this.formatError(err, 'Could not send WhatsApp reminder.'));
      },
    });
  }

  isPdf(): boolean {
    return this.contentType().includes('pdf');
  }

  openLabelScan(): void {
    this.scanError.set(null);
    void this.labelReader()?.openCamera();
  }

  onLabelExtracted(ex: ShippingLabelExtraction): void {
    if (ex.trackingNumber) this.trackingNumber = ex.trackingNumber;
    if (ex.retailer && isRetailerOption(ex.retailer)) {
      this.retailer = ex.retailer;
    }
    if (ex.suiteNumber) {
      this.suiteNumber = ex.suiteNumber;
      queueMicrotask(() => this.lookupSuite());
    }
    if (ex.confidence === 'low') {
      this.scanError.set('Could not read enough from this label. Check the fields below.');
    } else {
      this.scanError.set(null);
    }
  }

  onTrackingWedge(event: Event): void {
    const raw = this.trackingNumber.trim();
    if (!raw) return;
    this.trackingNumber = this.barcodeScan.normalizeTracking(raw);
    event.preventDefault();
    this.trackingInput()?.nativeElement.blur();
  }

  canContinueScan(): boolean {
    return !!this.retailer.trim();
  }

  nextFromScan(): void {
    if (!this.canContinueScan()) return;
    this.pushRecentScan();
    if (this.suiteNumber.trim() && !this.suiteLookup()) {
      this.lookupSuite();
    }
    this.step.set(1);
  }

  nextFromMatch(): void {
    if (!this.suiteLookup()?.canReceiveParcels) return;
    this.step.set(2);
  }

  canCapture(): boolean {
    return !!this.itemName.trim();
  }

  categoryLabel(): string {
    return formatProductCategory(this.categoryId, this.subcategoryId);
  }

  onInspectionPhoto(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    this.pendingPhotos.update((list) => [
      ...list,
      { id: crypto.randomUUID(), file, previewUrl },
    ]);
    (event.target as HTMLInputElement).value = '';
  }

  removePendingPhoto(id: string): void {
    const hit = this.pendingPhotos().find((p) => p.id === id);
    if (hit) URL.revokeObjectURL(hit.previewUrl);
    this.pendingPhotos.update((list) => list.filter((p) => p.id !== id));
  }

  onInvoiceSelected(event: Event): void {
    const key = this.session.opsKey();
    const parcelId = this.receivedResult()?.parcelId;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!key || !parcelId || !file) return;

    this.invoiceUploadBusy.set(true);
    this.invoiceErr.set(null);
    this.api.uploadInvoice(parcelId, file, key).subscribe({
      next: (result) => {
        this.invoiceUploadBusy.set(false);
        this.invoiceMsg.set(result.message);
        this.overlay.success(result.message);
        this.api.getParcel(parcelId, key).subscribe((parcel) => {
          this.receivedParcel.set(parcel);
          this.loadInvoicePreview(key, parcelId);
        });
      },
      error: (err: unknown) => {
        this.invoiceUploadBusy.set(false);
        const msg = this.formatError(err, 'Invoice upload failed.');
        this.invoiceErr.set(msg);
        this.overlay.error(msg);
      },
    });
  }

  saveAndContinue(): void {
    const key = this.session.opsKey();
    if (!key || !this.suiteLookup()?.canReceiveParcels || !this.canCapture()) return;
    this.busy.set(true);
    this.error.set(null);

    this.api
      .intake(
        {
          suiteNumber: this.suiteNumber.trim(),
          retailer: this.retailer.trim(),
          trackingNumber: this.trackingNumber.trim() || null,
          itemName: this.itemName.trim(),
          category: this.categoryLabel(),
          declaredValueZar: this.declaredValueZar,
          dimensionsLabel: this.dimensionsLabel.trim() || null,
          weightKg: this.weightKg,
        },
        key,
      )
      .pipe(
        switchMap((result) => {
          this.receivedResult.set(result);
          const inspection$ = this.api.saveInspection(
            result.parcelId,
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
          );
          const photos = this.pendingPhotos();
          const uploads$ =
            photos.length === 0
              ? of([])
              : forkJoin(
                  photos.map((ph) => this.api.uploadPhoto(result.parcelId, 'INSPECTION', ph.file, key)),
                );
          return forkJoin({
            result: of(result),
            inspection: inspection$,
            uploads: uploads$,
          });
        }),
        switchMap(({ result, inspection }) => {
          this.applyInvoiceReminderFeedback(
            inspection.invoiceReminderWhatsAppStatus,
            inspection.invoiceReminderWhatsAppDetail,
          );
          const key2 = this.session.opsKey();
          if (!key2) return of(result);
          return this.api.getParcel(result.parcelId, key2).pipe(
            switchMap((parcel) => {
              this.receivedParcel.set(parcel);
              this.receivedDisplayId.set(parcel.displayId);
              this.inspectionSaved.set(true);
              if (parcel.invoiceFileName) this.loadInvoicePreview(key2, result.parcelId);
              return of(result);
            }),
          );
        }),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.step.set(3);
        },
        error: (err: unknown) => {
          this.busy.set(false);
          this.error.set(this.formatError(err, 'Could not register parcel.'));
        },
      });
  }

  approveInvoice(): void {
    void this.verifyInvoice('APPROVE', true);
  }

  rejectInvoice(): void {
    void this.verifyInvoice('REJECT', false);
  }

  finishWithoutInvoice(): void {
    this.step.set(4);
  }

  applyRecent(item: RecentScan): void {
    this.trackingNumber = item.trackingNumber;
    this.retailer = item.retailer;
  }

  relativeTime(scannedAt: number): string {
    const mins = Math.floor((Date.now() - scannedAt) / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  lookupSuite(): void {
    const suite = this.suiteNumber.trim();
    const key = this.session.opsKey();
    if (!suite || !key) return;
    this.lookupLoading.set(true);
    this.suiteLookupError.set(null);
    this.api.lookupSuite(suite, key).subscribe({
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

  receiveAnother(): void {
    this.revokePendingPhotos();
    if (this.invoiceObjectUrl) {
      URL.revokeObjectURL(this.invoiceObjectUrl);
      this.invoiceObjectUrl = null;
    }
    this.step.set(0);
    this.receivedResult.set(null);
    this.receivedParcel.set(null);
    this.receivedDisplayId.set(null);
    this.suiteNumber = '';
    this.trackingNumber = '';
    this.itemName = '';
    this.weightKg = null;
    this.declaredValueZar = null;
    this.dimensionsLabel = '';
    this.packagingType = 'Corrugated box';
    this.packagingTypeOther = '';
    this.warehouseLocation = '';
    this.conditionStatus = 'GOOD';
    this.outerPackagingIntact = true;
    this.sealIntact = true;
    this.labelReadable = true;
    this.goodsAsDescribed = true;
    this.inspectionNotes = '';
    this.suiteLookup.set(null);
    this.suiteLookupError.set(null);
    this.error.set(null);
    this.scanError.set(null);
    this.inspectionSaved.set(false);
    this.invoiceVerified.set(false);
    this.invoiceMsg.set(null);
    this.invoiceErr.set(null);
    this.invoiceReminderStatus.set(null);
    this.invoiceReminderDetail.set(null);
    this.invoiceReminderBusy.set(false);
    this.previewUrl.set(null);
    this.previewError.set(null);
    this.retailer = 'Takealot';
  }

  private async verifyInvoice(decision: 'APPROVE' | 'REJECT', advance: boolean): Promise<void> {
    const key = this.session.opsKey();
    const parcelId = this.receivedResult()?.parcelId;
    if (!key || !parcelId) return;
    let reason: string | undefined;
    if (decision === 'REJECT') {
      const prompted = await this.overlay.requestInvoiceRejectionReason();
      if (!prompted) return;
      reason = prompted;
    }
    this.invoiceBusy.set(true);
    this.invoiceErr.set(null);
    this.api.verifyInvoice(parcelId, { decision, reason }, key).subscribe({
      next: (r) => {
        this.invoiceBusy.set(false);
        this.invoiceMsg.set(r.message);
        this.overlay.success(r.message);
        if (decision === 'APPROVE') {
          this.invoiceVerified.set(true);
        }
        this.api.getParcel(parcelId, key).subscribe((p) => this.receivedParcel.set(p));
        if (advance) this.step.set(4);
      },
      error: (err) => {
        this.invoiceBusy.set(false);
        const msg = this.formatError(err, 'Invoice action failed.');
        this.invoiceErr.set(msg);
        this.overlay.error(msg);
      },
    });
  }

  private loadInvoicePreview(key: string, parcelId: string): void {
    this.api.downloadInvoiceBlob(parcelId, key).subscribe({
      next: (blob) => {
        if (this.invoiceObjectUrl) URL.revokeObjectURL(this.invoiceObjectUrl);
        this.contentType.set(blob.type);
        this.invoiceObjectUrl = URL.createObjectURL(blob);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.invoiceObjectUrl));
      },
      error: () => this.previewError.set('Could not load invoice file.'),
    });
  }

  private applyInvoiceReminderFeedback(status: string, detail: string | null): void {
    this.invoiceReminderStatus.set(status);
    this.invoiceReminderDetail.set(detail);
    if (status === 'Sent') {
      this.overlay.success('WhatsApp sent — customer asked to upload invoice.');
    } else if (status === 'AlreadySent') {
      this.overlay.info('Customer was already reminded via WhatsApp.');
    } else if (status === 'Skipped') {
      this.overlay.info(detail ?? 'WhatsApp reminder not sent — customer has no phone on profile.');
    } else if (status === 'Failed') {
      this.overlay.error(detail ?? 'WhatsApp reminder failed to send.');
    }
  }

  private revokePendingPhotos(): void {
    for (const ph of this.pendingPhotos()) {
      URL.revokeObjectURL(ph.previewUrl);
    }
    this.pendingPhotos.set([]);
  }

  private pushRecentScan(): void {
    const entry: RecentScan = {
      trackingNumber: this.trackingNumber.trim(),
      retailer: this.retailer,
      scannedAt: Date.now(),
    };
    const next = [entry, ...this.recentScans().filter((r) => r.trackingNumber !== entry.trackingNumber)].slice(
      0,
      MAX_RECENT,
    );
    this.recentScans.set(next);
    try {
      localStorage.setItem(RECENT_SCANS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  private loadRecentScans(): RecentScan[] {
    try {
      const raw = localStorage.getItem(RECENT_SCANS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as RecentScan[];
      return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
    } catch {
      return [];
    }
  }

  private formatError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; title?: string } | string | null;
      if (typeof body === 'string' && body) return body;
      if (body && typeof body === 'object' && body.detail) return body.detail;
      if (body && typeof body === 'object' && body.title) return body.title;
    }
    return fallback;
  }
}
