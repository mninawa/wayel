import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ParcelDetail, ParcelListItem } from '../../models/parcel.models';
import {
  formatDimensionsLabel,
  formatParcelDateTime,
  formatParcelReference,
} from '../../models/parcel.models';
import { CustomerAccountService } from '../../services/customer-account.service';
import { ParcelsService } from '../../services/parcels.service';
import { SuiteExpiredBannerComponent } from '../shared/suite-expired-banner.component';

interface TimelineEvent {
  label: string;
  time: string;
  done: boolean;
  current: boolean;
}

interface CustomsItem {
  label: string;
  status: 'verified' | 'ready' | 'passed' | 'pending' | 'required';
  statusLabel: string;
}

@Component({
  selector: 'app-parcel-details',
  standalone: true,
  imports: [RouterLink, SuiteExpiredBannerComponent, DecimalPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (parcel(); as p) {
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/received-parcels">Parcels</a>
        <span class="material-icons-outlined">chevron_right</span>
        <span>{{ parcelRef() }}</span>
      </nav>

      <header class="page-header">
        <h1>Parcel Details</h1>
        <a routerLink="/received-parcels" class="bb-btn bb-btn-outline">Back to Parcels</a>
      </header>

      <app-suite-expired-banner />

      @if (p.invoiceStatus === 'Pending' && p.canUploadInvoice) {
        <section class="invoice-alert" role="status">
          <span class="material-icons-outlined">upload_file</span>
          <div>
            <strong>Invoice required</strong>
            <p>Upload your retailer invoice below so we can verify customs documentation before ship-out.</p>
          </div>
        </section>
      }

      <div class="detail-layout">
        <!-- Invoice — shown first so upload is the primary action -->
        <section class="bb-card bb-card-pad card-invoice" [class.pending]="p.invoiceStatus === 'Pending'">
          <h2 class="bb-card-title">{{ p.invoiceStatus === 'Uploaded' ? 'Uploaded invoice' : 'Upload invoice' }}</h2>
          @if (p.invoiceStatus === 'Uploaded') {
            <div class="invoice-viewer">
              @if (invoicePreviewFailed()) {
                <div class="invoice-frame invoice-frame--fallback">
                  <span class="material-icons-outlined">description</span>
                  <p>Preview unavailable. Use download to open the file.</p>
                  <strong>{{ p.invoiceFileName }}</strong>
                </div>
              } @else {
                <div class="invoice-frame" [class.is-loading]="invoicePreviewLoading() && !invoicePreviewBlobUrl()">
                  @if (invoicePreviewLoading() && !invoicePreviewBlobUrl()) {
                    <div class="invoice-frame-overlay">
                      <span class="material-icons-outlined spin">progress_activity</span>
                      <span>Loading preview…</span>
                    </div>
                  }
                  @if (invoicePreviewBlobUrl()) {
                    @if (isInvoicePreviewImage()) {
                      <img
                        [src]="invoicePreviewBlobUrl()!"
                        [alt]="p.invoiceFileName ?? 'Uploaded invoice'"
                        (load)="onPreviewLoad()"
                        (error)="onPreviewError()"
                      />
                    } @else if (safeInvoicePreviewUrl()) {
                      <iframe
                        [src]="safeInvoicePreviewUrl()!"
                        title="Invoice document preview"
                        (load)="onPreviewLoad()"
                      ></iframe>
                    }
                  }
                </div>
              }
              <a
                class="invoice-download-bar"
                [href]="invoiceDownloadLink()"
                [attr.download]="p.invoiceFileName ?? 'invoice'"
                target="_blank"
                rel="noopener"
              >
                <span class="material-icons-outlined">download</span>
                Download invoice
              </a>
              <p class="invoice-meta">Uploaded {{ parcelsApi.displayDate(p.invoiceUploadedAtUtc ?? p.receivedAtUtc) }}</p>
              @if (p.canUploadInvoice) {
                <label class="invoice-replace-bar" [class.uploading]="uploading()">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,application/pdf"
                    (change)="onFile($event)"
                    [disabled]="uploading()"
                  />
                  @if (uploading()) {
                    <span class="material-icons-outlined spin">progress_activity</span>
                    <span>Replacing…</span>
                  } @else {
                    <span class="material-icons-outlined">upload_file</span>
                    <span>Replace invoice</span>
                  }
                </label>
              }
              @if (uploadError()) {
                <p class="err">{{ uploadError() }}</p>
              }
            </div>
          } @else if (p.canUploadInvoice) {
            <p class="hint invoice-required-hint">Upload your retailer invoice (PDF or image) for customs verification.</p>
            <label class="upload-zone" [class.uploading]="uploading()">
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf" (change)="onFile($event)" [disabled]="uploading()" />
              @if (uploading()) {
                <span class="material-icons-outlined spin">progress_activity</span>
                <span>Uploading…</span>
              } @else {
                <span class="material-icons-outlined">cloud_upload</span>
                <span>Choose file or drag here</span>
                <span class="upload-types">PDF, JPEG, PNG, or WebP · max 25 MB</span>
              }
            </label>
            @if (uploadError()) {
              <p class="err">{{ uploadError() }}</p>
            }
          } @else {
            <p class="hint">Invoice upload is not available for your current suite status.</p>
          }
        </section>

        <div class="top-band" [class.has-photos]="hasPhotos()">
          <section class="bb-card bb-card-pad card-id">
            <div class="id-head">
              <div>
                <span class="label">Parcel ID</span>
                <div class="id-row">
                  <strong class="ref">{{ parcelRef() }}</strong>
                  <button type="button" class="icon-btn" (click)="copyText(parcelRef())" title="Copy parcel ID">
                    <span class="material-icons-outlined">content_copy</span>
                  </button>
                </div>
              </div>
              <span class="bb-badge" [class]="statusBadgeClass(p.status)">{{ statusLabel(p.status) }}</span>
            </div>
            <dl class="meta-grid">
              <div><dt>Tracking</dt><dd class="mono">{{ p.trackingNumber ?? '—' }}</dd></div>
              <div><dt>Retailer</dt><dd>{{ retailerDisplay(p.retailer) }}</dd></div>
              <div><dt>Item</dt><dd>{{ p.itemName }}</dd></div>
              <div><dt>Category</dt><dd>{{ p.category }}</dd></div>
              <div><dt>Received</dt><dd>{{ formatParcelDateTime(p.receivedAtUtc) }}</dd></div>
              <div><dt>Warehouse</dt><dd>{{ warehouseLocation() }}</dd></div>
              <div class="span2"><dt>Suite</dt><dd class="mono">Suite {{ displaySuiteNumber() }}</dd></div>
            </dl>
          </section>

          <section class="bb-card bb-card-pad card-physical">
            <div class="card-head-row">
              <h2 class="bb-card-title">Physical attributes</h2>
              @if (canEditPhysical(p) && !editingPhysical()) {
                <button
                  type="button"
                  class="bb-btn bb-btn-outline bb-btn-outline-sm edit-inline-btn"
                  (click)="startPhysicalEdit(p)"
                >
                  <span class="material-icons-outlined">edit</span>
                  Edit
                </button>
              }
            </div>
            <div class="metric-row">
              <div class="metric" [class.metric-editing]="editingPhysical()">
                <span class="metric-label">Weight</span>
                @if (editingPhysical()) {
                  <div class="metric-input-wrap">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      class="metric-input"
                      [(ngModel)]="draftWeightKg"
                      name="weightKg"
                      placeholder="0.00"
                    />
                    <span class="metric-suffix">kg</span>
                  </div>
                } @else {
                  <strong>{{ parcelsApi.displayWeight(p.weightKg) }}</strong>
                }
              </div>
              <div class="metric" [class.metric-editing]="editingPhysical()">
                <span class="metric-label">Dimensions</span>
                @if (editingPhysical()) {
                  <input
                    type="text"
                    class="metric-input metric-input-full"
                    [(ngModel)]="draftDimensions"
                    name="dimensions"
                    placeholder="40 × 20 × 5 cm"
                  />
                } @else {
                  <strong>{{ formatDimensionsLabel(p.dimensionsLabel) }}</strong>
                }
              </div>
              <div class="metric" [class.metric-editing]="editingPhysical()">
                <span class="metric-label">Declared value</span>
                @if (editingPhysical()) {
                  <div class="metric-input-wrap">
                    <span class="metric-prefix">R</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      class="metric-input"
                      [(ngModel)]="draftDeclaredValue"
                      name="declaredValue"
                      placeholder="0"
                    />
                  </div>
                } @else {
                  <strong>@if (p.declaredValueZar != null) { R{{ p.declaredValueZar | number }} } @else { — }</strong>
                }
              </div>
            </div>
            @if (editingPhysical()) {
              <div class="physical-edit-actions">
                @if (physicalSaveError()) {
                  <p class="physical-edit-error" role="alert">{{ physicalSaveError() }}</p>
                }
                <button
                  type="button"
                  class="bb-btn bb-btn-outline bb-btn-outline-sm"
                  (click)="cancelPhysicalEdit()"
                  [disabled]="physicalSaving()"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="bb-btn bb-btn-primary bb-btn-outline-sm"
                  (click)="savePhysicalEdit()"
                  [disabled]="physicalSaving()"
                >
                  @if (physicalSaving()) { Saving… } @else { Save }
                </button>
              </div>
            }
            <div class="chip-row">
              <span class="chip chip-ok"><span class="material-icons-outlined">check_circle</span> Condition · Good</span>
              @if (p.invoiceStatus === 'Uploaded') {
                <span class="chip chip-ok"><span class="material-icons-outlined">check_circle</span> Invoice · Verified</span>
              } @else {
                <span class="chip chip-warn"><span class="material-icons-outlined">schedule</span> Invoice · Pending</span>
              }
            </div>
            @if (p.invoiceStatus === 'Uploaded') {
              <p class="info-box success">
                <span class="material-icons-outlined">info</span>
                Invoice verified and matches items received.
              </p>
            } @else if (p.canUploadInvoice) {
              <p class="info-box warn">
                <span class="material-icons-outlined">info</span>
                Upload your invoice below to complete verification.
              </p>
            }
          </section>

          @if (hasPhotos()) {
            <section class="bb-card bb-card-pad card-photos">
              <div class="card-head-row">
                <h2 class="bb-card-title">Parcel photos</h2>
                <a class="photo-view-all" href="#" (click)="openPhotos($event)">View all ({{ parcelPhotos().length }})</a>
              </div>
              <div class="photo-grid">
                @for (ph of parcelPhotos(); track ph.id) {
                  <a class="photo-thumb" [href]="ph.url" target="_blank" rel="noopener" [title]="ph.caption ?? 'Parcel photo'">
                    <img [src]="ph.url" [alt]="ph.caption ?? 'Warehouse parcel photo'" loading="lazy" />
                  </a>
                }
              </div>
            </section>
          }
        </div>

        <div class="bottom-band">
        <section class="bb-card bb-card-pad card-timeline">
          <h2 class="bb-card-title">Parcel timeline</h2>
          <ol class="timeline">
            @for (ev of timeline(); track ev.label) {
              <li [class.done]="ev.done" [class.current]="ev.current">
                <span class="dot"></span>
                <div class="tl-body">
                  <strong>{{ ev.label }}</strong>
                  <span>{{ ev.time }}</span>
                </div>
              </li>
            }
          </ol>
        </section>

        <!-- Customs -->
        <section class="bb-card bb-card-pad card-customs">
          <h2 class="bb-card-title">Customs &amp; documentation</h2>
          <ul class="customs-list">
            @for (c of customsChecklist(); track c.label) {
              <li [class]="'customs-' + c.status">
                <span class="material-icons-outlined">{{ customsIcon(c.status) }}</span>
                <span>{{ c.label }}</span>
                <strong>{{ c.statusLabel }}</strong>
              </li>
            }
          </ul>
          @if (docsComplete()) {
            <p class="info-box success">
              <span class="material-icons-outlined">info</span>
              All documentation looks good.
            </p>
          } @else {
            <p class="info-box warn">
              <span class="material-icons-outlined">info</span>
              Complete your invoice upload to finish customs documentation.
            </p>
          }
        </section>
        </div>
      </div>

    } @else if (loadError()) {
      <p class="err">{{ loadError() }}</p>
      <a routerLink="/received-parcels" class="bb-link">← Back to parcels</a>
    } @else {
      <p class="loading">Loading parcel…</p>
    }
  `,
  styles: `
    .crumbs {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.82rem;
      color: var(--bb-muted);
      margin-bottom: 0.75rem;
    }
    .crumbs a { color: var(--bb-link); text-decoration: none; font-weight: 600; }
    .crumbs .material-icons-outlined { font-size: 16px !important; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .page-header h1 { margin: 0; font-size: 1.5rem; font-weight: 700; color: var(--bb-text); }
    .invoice-alert {
      display: flex;
      gap: 0.85rem;
      padding: 1rem 1.15rem;
      margin-bottom: 1rem;
      border-radius: var(--bb-radius-sm);
      border: 1px solid #fca5a5;
      background: #fef2f2;
    }
    .invoice-alert .material-icons-outlined { color: #dc2626; font-size: 26px; }
    .invoice-alert strong { display: block; color: #b91c1c; }
    .invoice-alert p { margin: 0.25rem 0 0; font-size: 0.85rem; color: #991b1b; }
    .detail-layout { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
    .top-band {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      align-items: stretch;
    }
    .top-band.has-photos { grid-template-columns: 1.05fr 1fr 0.85fr; }
    @media (max-width: 1100px) {
      .top-band, .top-band.has-photos { grid-template-columns: 1fr; }
    }
    .bottom-band {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      align-items: stretch;
    }
    @media (max-width: 1000px) { .bottom-band { grid-template-columns: 1fr; } }
    .bottom-band .bb-card { height: 100%; }
    .top-band .bb-card { height: 100%; }
    .card-head-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }
    .card-head-row .bb-card-title { margin: 0; }
    .photo-view-all { font-size: 0.75rem; color: var(--bb-link); font-weight: 600; text-decoration: none; }
    .photo-view-all:hover { text-decoration: underline; }
    .id-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .label { font-size: 0.72rem; color: var(--bb-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .id-row { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.15rem; }
    .ref { font-size: 1.25rem; color: var(--bb-text); }
    .icon-btn {
      border: none;
      background: var(--bb-primary-soft);
      color: var(--bb-link);
      border-radius: 6px;
      padding: 0.2rem;
      cursor: pointer;
      display: inline-flex;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem 1rem;
      margin: 0;
    }
    .meta-grid > div { font-size: 0.82rem; }
    .meta-grid .span2 { grid-column: span 2; }
    .meta-grid dt { margin: 0 0 0.1rem; color: var(--bb-muted); font-size: 0.7rem; font-weight: 500; }
    .meta-grid dd { margin: 0; font-weight: 600; color: var(--bb-text); }
    .mono { font-family: ui-monospace, monospace; font-size: 0.78rem; }
    .metric-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.65rem;
      margin-bottom: 0.85rem;
    }
    @media (max-width: 600px) { .metric-row { grid-template-columns: 1fr; } }
    .metric {
      padding: 0.7rem 0.75rem;
      background: #f8fafc;
      border: 1px solid #f1f5f9;
      border-radius: var(--bb-radius-sm);
    }
    .card-physical .card-head-row { margin-bottom: 0.5rem; }
    .card-physical .bb-card-title { margin: 0; }
    .edit-inline-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
      flex-shrink: 0;
    }
    .edit-inline-btn .material-icons-outlined { font-size: 16px !important; }
    .metric-label { display: block; font-size: 0.68rem; color: var(--bb-muted); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 0.2rem; }
    .metric strong { font-size: 0.92rem; color: var(--bb-text); }
    .metric-editing { background: #fff; border-color: var(--bb-border); }
    .metric-input-wrap {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .metric-input {
      width: 100%;
      min-width: 0;
      border: 1px solid var(--bb-border);
      border-radius: 6px;
      padding: 0.35rem 0.45rem;
      font-size: 0.88rem;
      font-weight: 600;
      color: var(--bb-text);
      background: #fff;
    }
    .metric-input:focus {
      outline: 2px solid var(--bb-primary-soft);
      border-color: var(--bb-link);
    }
    .metric-input-full { font-weight: 600; }
    .metric-suffix, .metric-prefix {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--bb-muted);
      flex-shrink: 0;
    }
    .physical-edit-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    .physical-edit-error {
      flex: 1 1 100%;
      margin: 0;
      font-size: 0.78rem;
      color: #b91c1c;
    }
    .chip-row { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 0.75rem; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.3rem 0.55rem;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 600;
    }
    .chip .material-icons-outlined { font-size: 14px !important; }
    .chip-ok { background: var(--bb-success-soft); color: #15803d; }
    .chip-warn { background: var(--bb-warning-soft); color: #b45309; }
    .info-box {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      padding: 0.65rem 0.75rem;
      border-radius: var(--bb-radius-sm);
      font-size: 0.8rem;
      margin: 0;
      line-height: 1.4;
    }
    .info-box .material-icons-outlined { font-size: 18px !important; flex-shrink: 0; }
    .info-box.success { background: var(--bb-primary-soft); color: var(--bb-ink); }
    .info-box.warn { background: var(--bb-warning-soft); color: #92400e; }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.5rem;
    }
    .photo-thumb {
      display: block;
      aspect-ratio: 1;
      border-radius: var(--bb-radius-sm);
      overflow: hidden;
      border: 1px solid var(--bb-border);
      background: #f1f5f9;
    }
    .photo-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .timeline { list-style: none; margin: 0; padding: 0; }
    .timeline li {
      display: flex;
      gap: 0.75rem;
      padding: 0.5rem 0;
      position: relative;
    }
    .timeline li:not(:last-child)::before {
      content: '';
      position: absolute;
      left: 5px;
      top: 1.25rem;
      bottom: -0.25rem;
      width: 2px;
      background: #e2e8f0;
    }
    .timeline li.done:not(:last-child)::before { background: #86efac; }
    .timeline .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #e2e8f0;
      flex-shrink: 0;
      margin-top: 0.2rem;
      z-index: 1;
    }
    .timeline li.done .dot { background: var(--bb-success); }
    .timeline li.current .dot {
      background: var(--bb-primary);
      box-shadow: 0 0 0 3px var(--bb-primary-soft);
    }
    .tl-body strong { display: block; font-size: 0.85rem; }
    .tl-body span { font-size: 0.75rem; color: var(--bb-muted); }
    .card-invoice.pending {
      border: 2px solid #ef4444;
      background: linear-gradient(135deg, #fef2f2 0%, #fff 55%);
      box-shadow: 0 4px 24px rgba(239, 68, 68, 0.14);
    }
    .card-invoice.pending .bb-card-title { color: #b91c1c; }
    .invoice-required-hint { color: #991b1b; font-weight: 600; margin-bottom: 0.85rem; }
    .card-invoice.pending .upload-zone {
      border-color: #f87171;
      background: #fff;
      color: #7f1d1d;
    }
    .card-invoice.pending .upload-zone:hover {
      border-color: #ef4444;
      background: #fef2f2;
    }
    .card-invoice.pending .upload-zone .material-icons-outlined { color: #dc2626; }
    .invoice-viewer { display: flex; flex-direction: column; }
    .invoice-frame {
      position: relative;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fff;
      overflow: hidden;
      min-height: 320px;
      max-height: 420px;
    }
    .invoice-frame.is-loading iframe,
    .invoice-frame.is-loading img { visibility: hidden; }
    .invoice-frame-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: #f8fafc;
      color: var(--bb-muted);
      font-size: 0.85rem;
      z-index: 1;
    }
    .invoice-frame iframe {
      width: 100%;
      height: 400px;
      border: none;
      display: block;
      background: #fff;
    }
    .invoice-frame img {
      width: 100%;
      max-height: 400px;
      object-fit: contain;
      object-position: top center;
      display: block;
      background: #fff;
    }
    .invoice-frame--fallback {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 2rem 1rem;
      text-align: center;
      color: var(--bb-muted);
      font-size: 0.85rem;
    }
    .invoice-frame--fallback .material-icons-outlined { font-size: 40px !important; color: #94a3b8; }
    .invoice-frame--fallback strong { color: var(--bb-text); font-size: 0.82rem; word-break: break-word; }
    .invoice-download-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      width: 100%;
      margin-top: 0.75rem;
      padding: 0.8rem 1rem;
      border: 1px solid var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fff;
      color: var(--bb-link);
      font-weight: 600;
      font-size: 0.88rem;
      text-decoration: none;
      transition: background 0.15s, border-color 0.15s;
    }
    .invoice-download-bar:hover {
      background: var(--bb-primary-soft);
      border-color: #bfdbfe;
    }
    .invoice-download-bar .material-icons-outlined { font-size: 20px !important; }
    .invoice-meta { margin: 0.5rem 0 0; font-size: 0.72rem; color: var(--bb-muted); text-align: center; }
    .invoice-replace-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      width: 100%;
      margin-top: 0.5rem;
      padding: 0.65rem 1rem;
      border: 1px dashed var(--bb-border);
      border-radius: var(--bb-radius-sm);
      background: #fafafa;
      color: var(--bb-muted);
      font-weight: 600;
      font-size: 0.82rem;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
    }
    .invoice-replace-bar:hover { border-color: var(--bb-link); color: var(--bb-link); background: var(--bb-primary-soft); }
    .invoice-replace-bar.uploading { pointer-events: none; opacity: 0.85; }
    .invoice-replace-bar input { display: none; }
    .card-invoice .err { margin-top: 0.5rem; text-align: center; }
    .customs-list { list-style: none; margin: 0 0 0.75rem; padding: 0; }
    .customs-list li {
      display: grid;
      grid-template-columns: 24px 1fr auto;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 0;
      font-size: 0.84rem;
      border-bottom: 1px solid #f1f5f9;
    }
    .customs-list strong { font-size: 0.78rem; }
    .customs-verified strong, .customs-passed strong, .customs-ready strong { color: #15803d; }
    .customs-pending strong, .customs-required strong { color: #b45309; }
    .customs-verified .material-icons-outlined, .customs-passed .material-icons-outlined, .customs-ready .material-icons-outlined { color: var(--bb-success); }
    .customs-pending .material-icons-outlined, .customs-required .material-icons-outlined { color: var(--bb-warning); }
    .upload-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.5rem;
      border: 2px dashed var(--bb-border);
      border-radius: var(--bb-radius-sm);
      cursor: pointer;
      text-align: center;
      font-size: 0.85rem;
      color: var(--bb-muted);
    }
    .upload-zone input { display: none; }
    .upload-zone.uploading { pointer-events: none; border-color: var(--bb-link); }
    .upload-types { font-size: 0.72rem; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .hint, .err { font-size: 0.82rem; }
    .err { color: var(--bb-danger); }
    .bb-badge-received { background: var(--bb-success-soft); color: #15803d; }
    .bb-badge-ready { background: var(--bb-warning-soft); color: #b45309; }
    .bb-badge-transit { background: var(--bb-primary-soft); color: var(--bb-ink); }
    .bb-badge-awaiting { background: var(--bb-warning-soft); color: #b45309; }
    .bb-badge-default { background: #f1f5f9; color: var(--bb-muted); }
    .bb-card-title { margin: 0 0 0.75rem; font-size: 0.95rem; }
    .loading { color: var(--bb-muted); }
  `,
})
export class ParcelDetailsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  readonly parcelsApi = inject(ParcelsService);
  private readonly accountApi = inject(CustomerAccountService);

  readonly parcel = signal<ParcelDetail | null>(null);
  readonly uploading = signal(false);
  readonly uploadError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly invoicePreviewLoading = signal(false);
  readonly invoicePreviewFailed = signal(false);
  readonly invoicePreviewBlobUrl = signal<string | null>(null);
  readonly invoicePreviewIsImage = signal(false);
  readonly editingPhysical = signal(false);
  readonly physicalSaving = signal(false);
  readonly physicalSaveError = signal<string | null>(null);

  draftWeightKg: number | null = null;
  draftDimensions = '';
  draftDeclaredValue: number | null = null;

  private invoiceObjectUrl: string | null = null;

  readonly parcelRef = computed(() =>
    this.parcel() ? formatParcelReference(this.parcel()!.id) : '',
  );

  readonly displaySuiteNumber = computed(() => {
    const p = this.parcel();
    if (!p) return '—';
    const fromAccount = this.accountApi.account()?.suiteAddress?.suiteNumber?.trim();
    const fromDashboard = this.parcelsApi.dashboard()?.suiteNumber?.trim();
    return fromAccount || fromDashboard || p.suiteNumber;
  });

  readonly warehouseLocation = computed(() => {
    const wh = this.accountApi.account()?.suiteAddress?.warehouseName?.trim();
    const city = this.accountApi.account()?.suiteAddress?.city?.trim();
    if (wh && city) return `${wh}, ${city}, South Africa`;
    return 'Johannesburg, South Africa';
  });

  readonly timeline = computed((): TimelineEvent[] => {
    const p = this.parcel();
    if (!p) return [];
    const received = formatParcelDateTime(p.receivedAtUtc);
    const invoiceTime = p.invoiceUploadedAtUtc
      ? formatParcelDateTime(p.invoiceUploadedAtUtc)
      : '—';
    const hasInvoice = p.invoiceStatus === 'Uploaded';
    const ready = p.status.toLowerCase().includes('ready');

    const steps: TimelineEvent[] = [
      { label: 'Parcel received', time: received, done: true, current: !hasInvoice },
    ];

    if (hasInvoice) {
      steps.push({
        label: 'Invoice verified',
        time: invoiceTime,
        done: true,
        current: false,
      });
      steps.push({
        label: 'Condition check completed',
        time: invoiceTime,
        done: true,
        current: false,
      });
      if (this.parcelPhotos().length > 0) {
        const photoTime =
          this.parcelPhotos().find((ph) => ph.capturedAtUtc)?.capturedAtUtc ?? p.receivedAtUtc;
        steps.push({
          label: 'Photos captured',
          time: formatParcelDateTime(photoTime),
          done: true,
          current: !ready,
        });
      }
    } else {
      steps.push({
        label: 'Invoice required',
        time: 'Awaiting upload',
        done: false,
        current: true,
      });
    }

    if (ready) {
      steps.push({
        label: 'Ready to ship',
        time: 'Available for ship-out',
        done: true,
        current: true,
      });
    } else if (hasInvoice) {
      steps.push({
        label: 'Ready to ship',
        time: 'After customs clearance',
        done: false,
        current: true,
      });
    }

    return steps;
  });

  readonly customsChecklist = computed((): CustomsItem[] => {
    const p = this.parcel();
    if (!p) return [];
    const invoiceOk = p.invoiceStatus === 'Uploaded';
    return [
      {
        label: 'Invoice',
        status: invoiceOk ? 'verified' : 'required',
        statusLabel: invoiceOk ? 'Verified' : 'Required',
      },
      {
        label: 'Packing list',
        status: invoiceOk ? 'ready' : 'pending',
        statusLabel: invoiceOk ? 'Ready' : 'Pending',
      },
      {
        label: 'Value declaration',
        status: p.declaredValueZar != null ? 'ready' : 'pending',
        statusLabel: p.declaredValueZar != null ? 'Ready' : 'Pending',
      },
      {
        label: 'Prohibited items check',
        status: 'passed',
        statusLabel: 'Passed',
      },
    ];
  });

  readonly docsComplete = computed(
    () => this.customsChecklist().every((c) => c.status !== 'pending' && c.status !== 'required'),
  );

  readonly parcelPhotos = computed(() =>
    (this.parcel()?.photos ?? []).filter((ph) => !!ph.url?.trim()),
  );

  readonly hasPhotos = computed(() => this.parcelPhotos().length > 0);

  readonly invoicePreviewSrc = computed(() => this.invoicePreviewBlobUrl());

  readonly safeInvoicePreviewUrl = computed((): SafeResourceUrl | null => {
    const url = this.invoicePreviewBlobUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  readonly formatParcelDateTime = formatParcelDateTime;
  readonly formatDimensionsLabel = formatDimensionsLabel;

  ngOnInit(): void {
    if (!this.accountApi.account()) {
      this.accountApi.loadAccount().subscribe();
    }
    this.parcelsApi.loadDashboard().subscribe();
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.parcelsApi.getParcel(id).subscribe({
      next: (p) => {
        this.parcel.set(p);
        this.loadError.set(null);
        this.refreshInvoicePreview();
      },
      error: () => this.loadError.set('Could not load parcel.'),
    });
  }

  ngOnDestroy(): void {
    this.revokeInvoicePreview();
  }

  invoiceDownloadLink(): string {
    const p = this.parcel();
    return p ? this.parcelsApi.invoiceDownloadPath(p.id, true) : '#';
  }

  isInvoicePreviewImage(): boolean {
    return this.invoicePreviewIsImage();
  }

  private refreshInvoicePreview(): void {
    this.revokeInvoicePreview();
    const p = this.parcel();
    if (!p || p.invoiceStatus !== 'Uploaded') return;

    this.invoicePreviewLoading.set(true);
    this.invoicePreviewFailed.set(false);
    this.parcelsApi.loadInvoicePreview(p.id, p.invoiceFileName).subscribe({
      next: ({ objectUrl, isImage }) => {
        this.invoiceObjectUrl = objectUrl;
        this.invoicePreviewBlobUrl.set(objectUrl);
        this.invoicePreviewIsImage.set(isImage);
        this.invoicePreviewLoading.set(false);
      },
      error: () => {
        this.invoicePreviewLoading.set(false);
        this.invoicePreviewFailed.set(true);
      },
    });
  }

  private revokeInvoicePreview(): void {
    if (this.invoiceObjectUrl) {
      URL.revokeObjectURL(this.invoiceObjectUrl);
      this.invoiceObjectUrl = null;
    }
    this.invoicePreviewBlobUrl.set(null);
    this.invoicePreviewIsImage.set(false);
  }

  onPreviewLoad(): void {
    this.invoicePreviewLoading.set(false);
    this.invoicePreviewFailed.set(false);
  }

  onPreviewError(): void {
    this.invoicePreviewLoading.set(false);
    this.invoicePreviewFailed.set(true);
  }

  statusLabel(status: string): string {
    const s = status.toLowerCase().replace(/\s+/g, '');
    if (s.includes('ready')) return 'Ready to ship';
    if (s.includes('received')) return 'Received';
    if (s.includes('awaiting')) return 'Awaiting invoice';
    if (s.includes('inshipment') || s.includes('shipment')) return 'In shipment';
    if (s.includes('delivered')) return 'Delivered';
    return status.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  statusBadgeClass(status: string): string {
    const s = status.toLowerCase().replace(/\s+/g, '');
    if (s.includes('ready')) return 'bb-badge bb-badge-ready';
    if (s.includes('received')) return 'bb-badge bb-badge-received';
    if (s.includes('inshipment') || s.includes('shipment')) return 'bb-badge bb-badge-transit';
    if (s.includes('awaiting')) return 'bb-badge bb-badge-awaiting';
    return 'bb-badge bb-badge-default';
  }

  retailerDisplay(retailer: string): string {
    if (retailer.toLowerCase().includes('.')) return retailer;
    return `${retailer}.com`;
  }

  orderReference(p: ParcelDetail): string {
    const prefix = p.retailer.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase() || 'ORD';
    const tail = (p.trackingNumber ?? p.id).replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase();
    return `${prefix}-${tail}`;
  }

  customsIcon(status: CustomsItem['status']): string {
    switch (status) {
      case 'verified':
      case 'passed':
      case 'ready':
        return 'check_circle';
      case 'required':
        return 'error_outline';
      default:
        return 'schedule';
    }
  }

  canEditPhysical(p: ParcelDetail): boolean {
    const s = p.status.toLowerCase().replace(/\s+/g, '');
    return !s.includes('inshipment') && !s.includes('shipment') && !s.includes('delivered');
  }

  startPhysicalEdit(p: ParcelDetail): void {
    this.draftWeightKg = p.weightKg;
    this.draftDimensions = p.dimensionsLabel?.trim() ?? '';
    this.draftDeclaredValue = p.declaredValueZar;
    this.physicalSaveError.set(null);
    this.editingPhysical.set(true);
  }

  cancelPhysicalEdit(): void {
    this.editingPhysical.set(false);
    this.physicalSaveError.set(null);
  }

  savePhysicalEdit(): void {
    const p = this.parcel();
    if (!p) return;

    if (this.draftWeightKg != null && this.draftWeightKg < 0) {
      this.physicalSaveError.set('Weight must be zero or greater.');
      return;
    }
    if (this.draftDeclaredValue != null && this.draftDeclaredValue < 0) {
      this.physicalSaveError.set('Declared value must be zero or greater.');
      return;
    }

    this.physicalSaving.set(true);
    this.physicalSaveError.set(null);
    this.parcelsApi
      .updatePhysicalAttributes(p.id, {
        weightKg: this.draftWeightKg,
        dimensionsLabel: this.draftDimensions.trim() || null,
        declaredValueZar: this.draftDeclaredValue,
      })
      .subscribe({
        next: (updated) => {
          this.parcel.set(updated);
          this.editingPhysical.set(false);
          this.physicalSaving.set(false);
        },
        error: (err: unknown) => {
          this.physicalSaving.set(false);
          this.physicalSaveError.set(this.formatPhysicalSaveError(err));
        },
      });
  }

  private formatPhysicalSaveError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; message?: string; title?: string } | null;
      if (body?.detail) return body.detail;
      if (body?.message) return body.message;
      if (body?.title && body.title !== 'Internal Server Error') return body.title;
      if (err.status === 0) return 'Could not reach the server.';
    }
    return err instanceof Error ? err.message : 'Could not save changes.';
  }

  copyText(text: string): void {
    void navigator.clipboard?.writeText(text);
  }

  openPhotos(event: Event): void {
    event.preventDefault();
    const first = this.parcelPhotos()[0]?.url;
    if (first) window.open(first, '_blank', 'noopener');
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.parcel()) return;
    const wasInitialUpload = this.parcel()!.invoiceStatus !== 'Uploaded';
    this.uploading.set(true);
    this.uploadError.set(null);
    this.parcelsApi.uploadInvoice(this.parcel()!.id, file).subscribe({
      next: (p) => {
        this.parcel.set(p);
        this.refreshInvoicePreview();
        this.uploading.set(false);
        input.value = '';
        if (wasInitialUpload) {
          void this.router.navigate(['/quotes', 'request'], {
            queryParams: { parcel: p.id, from: 'invoice-upload' },
          });
        }
      },
      error: (err: unknown) => {
        this.uploading.set(false);
        input.value = '';
        this.uploadError.set(this.formatUploadError(err));
      },
    });
  }

  private formatUploadError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string; message?: string; title?: string } | string | null;
      if (body && typeof body === 'object') {
        if (body.detail) return body.detail;
        if (body.message) return body.message;
        if (body.title && body.title !== 'Internal Server Error') return body.title;
      }
      if (err.status === 0) return 'Could not reach the server. Check your connection and try again.';
      if (err.status >= 500) return 'Upload failed on the server. Please try again in a moment.';
      if (err.status === 413) return 'File is too large. Maximum size is 25 MB.';
    }
    return err instanceof Error ? err.message : 'Upload failed. Please try again.';
  }
}
