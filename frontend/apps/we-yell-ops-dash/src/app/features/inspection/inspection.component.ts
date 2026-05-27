import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReceivingApiService, type OpsParcelDetailDto, type OpsPhotoDto } from '../../services/receiving-api.service';
import { OpsSessionService } from '../../services/ops-session.service';
import { opsPhotoUploadError } from '../../services/ops-parcel-photo-upload.service';
import { OpsOverlayService } from '../../shared/ops-overlay.service';
import {
  CONDITION_OPTIONS,
  PACKAGING_TYPE_OPTIONS,
  resolvePackagingTypeForSave,
  splitPackagingTypeFromApi,
} from '../../shared/ops-inspection-options';
import { receivingRoutes } from '../../types/receiving.types';

@Component({
  selector: 'ops-inspection',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <a [routerLink]="routes.parcel(parcelId())" class="back-link">← Back to parcel</a>
      <h1>Parcel Photos &amp; Inspection</h1>
      @if (parcel(); as p) {
        <p class="sub">{{ p.displayId }} · {{ p.itemName }}</p>
      }
      @if (success()) { <p class="ok">{{ success() }}</p> }
      @if (error()) { <p class="err">{{ error() }}</p> }

      <form class="ops-card ops-card-pad form" (ngSubmit)="save()">
        <div class="row2">
          <label><span>Packaging type</span>
            <select [(ngModel)]="packagingType" name="pkg">
              @for (opt of packagingTypes; track opt) {
                <option [value]="opt">{{ opt }}</option>
              }
            </select>
          </label>
          <label><span>Warehouse location</span><input [(ngModel)]="warehouseLocation" name="loc" placeholder="A1-02-03" /></label>
        </div>
        @if (packagingType === 'Other') {
          <label><span>Other packaging (describe)</span><input [(ngModel)]="packagingTypeOther" name="pkgOther" placeholder="e.g. Wooden crate" /></label>
        }
        <label><span>Condition</span>
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
        <label><span>Inspection notes</span><textarea [(ngModel)]="inspectionNotes" name="notes" rows="4"></textarea></label>

        <div class="photo-block">
          <h3>Inspection photos</h3>
          <input type="file" accept="image/jpeg,image/png,image/webp" (change)="onPhotoSelected($event)" />
          @if (photos().length) {
            <div class="photo-grid">
              @for (ph of photos(); track ph.photoId) {
                <figure class="photo-tile">
                  <img [src]="thumbUrls()[ph.photoId]" [alt]="ph.fileName" />
                  <button
                    type="button"
                    class="photo-delete"
                    [disabled]="photoDeleteBusy() === ph.photoId"
                    (click)="deletePhoto(ph)"
                    aria-label="Delete photo"
                  >
                    <span class="material-icons-outlined">delete</span>
                  </button>
                  <figcaption>{{ ph.fileName }}</figcaption>
                </figure>
              }
            </div>
          }
        </div>

        <button type="submit" class="ops-btn ops-btn-primary" [disabled]="busy()">Save inspection</button>
      </form>
    </div>
  `,
  styles: `
    .page { max-width: 760px; }
    .back-link { color: var(--ops-link); text-decoration: none; font-weight: 600; font-size: 0.85rem; }
    h1 { margin: 0.75rem 0 0.25rem; font-size: 1.25rem; }
    .sub { color: var(--ops-muted); margin: 0 0 1rem; }
    .form label { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.85rem; font-size: 0.85rem; }
    .form input, .form select, .form textarea { padding: 0.55rem 0.75rem; border: 1px solid var(--ops-border); border-radius: var(--ops-radius-sm); font: inherit; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem; }
    .checks { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.85rem; }
    .checks label { flex-direction: row; align-items: center; gap: 0.5rem; }
    .ok { background: var(--ops-success-soft); color: #15803d; padding: 0.65rem; border-radius: var(--ops-radius-sm); }
    .err { color: #b91c1c; }
    .photo-block { margin: 1rem 0; padding-top: 0.75rem; border-top: 1px solid var(--ops-border); }
    .photo-block h3 { margin: 0 0 0.5rem; font-size: 0.9rem; }
    .photo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.65rem; margin-top: 0.65rem; }
    .photo-tile { position: relative; margin: 0; }
    .photo-grid img { width: 100%; height: 96px; object-fit: cover; border-radius: var(--ops-radius-sm); border: 1px solid var(--ops-border); }
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
    }
    .photo-delete .material-icons-outlined { font-size: 16px; }
    .photo-grid figcaption { font-size: 0.68rem; color: var(--ops-muted); margin-top: 0.2rem; }
  `,
})
export class InspectionComponent implements OnInit {
  readonly parcelId = input.required<string>();
  readonly routes = receivingRoutes;
  readonly packagingTypes = PACKAGING_TYPE_OPTIONS;
  readonly conditionOptions = CONDITION_OPTIONS;

  private readonly api = inject(ReceivingApiService);
  private readonly http = inject(HttpClient);
  private readonly session = inject(OpsSessionService);
  private readonly overlay = inject(OpsOverlayService);

  readonly parcel = signal<OpsParcelDetailDto | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly photos = signal<OpsPhotoDto[]>([]);
  readonly thumbUrls = signal<Record<string, string>>({});
  readonly photoDeleteBusy = signal<string | null>(null);
  private thumbObjectUrls: string[] = [];

  packagingType = 'Corrugated box';
  packagingTypeOther = '';
  warehouseLocation = '';
  conditionStatus = 'GOOD';
  outerPackagingIntact = true;
  sealIntact = true;
  labelReadable = true;
  goodsAsDescribed = true;
  inspectionNotes = '';

  ngOnInit(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.api.getParcel(this.parcelId(), key).subscribe({
      next: (p) => {
        this.parcel.set(p);
        if (p.inspection) {
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
        this.loadPhotos(key);
      },
    });
  }

  onPhotoSelected(event: Event): void {
    const key = this.session.opsKey();
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!key || !file) return;
    this.api.uploadPhoto(this.parcelId(), 'INSPECTION', file, key).subscribe({
      next: () => {
        this.overlay.success('Inspection photo uploaded.');
        this.loadPhotos(key);
      },
      error: (err) => this.error.set(opsPhotoUploadError(err)),
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
        this.error.set(this.formatError(err));
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

  private loadPhotos(key: string): void {
    this.api.listPhotos(this.parcelId(), key, 'INSPECTION').subscribe({
      next: (list) => {
        this.photos.set(list);
        for (const ph of list) {
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

  save(): void {
    const key = this.session.opsKey();
    if (!key) return;
    this.busy.set(true);
    this.api.saveInspection(this.parcelId(), {
      conditionStatus: this.conditionStatus,
      warehouseLocation: this.warehouseLocation,
      packagingType: resolvePackagingTypeForSave(this.packagingType, this.packagingTypeOther),
      outerPackagingIntact: this.outerPackagingIntact,
      sealIntact: this.sealIntact,
      labelReadable: this.labelReadable,
      goodsAsDescribed: this.goodsAsDescribed,
      inspectionNotes: this.inspectionNotes,
    }, key).subscribe({
      next: (r) => { this.busy.set(false); this.success.set(`Inspection saved — readiness: ${r.quoteReadiness}`); },
      error: (err) => { this.busy.set(false); this.error.set(this.formatError(err)); },
    });
  }

  private formatError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { detail?: string } | null;
      if (body?.detail) return body.detail;
    }
    return 'Could not save inspection.';
  }
}
