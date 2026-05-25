import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, switchMap, tap } from 'rxjs';
import type { DashboardDto, ParcelDetailDto, ParcelDto } from './borderbox-api.service';
import { BorderboxApiService } from './borderbox-api.service';
import type { ParcelDetail, ParcelListItem, ParcelSummary } from '../models/parcel.models';
import {
  formatParcelDate,
  formatWeight,
  invoiceUiStatus,
} from '../models/parcel.models';

function mapListItem(d: ParcelDto): ParcelListItem {
  return {
    id: d.id,
    retailer: d.retailer,
    trackingNumber: d.trackingNumber,
    itemName: d.itemName,
    category: d.category,
    status: d.status,
    weightKg: d.weightKg,
    declaredValueZar: d.declaredValueZar,
    dimensionsLabel: d.dimensionsLabel ?? null,
    receivedAtUtc: d.receivedAtUtc,
    invoiceStatus: d.invoiceStatus === 'Uploaded' ? 'Uploaded' : 'Pending',
    invoiceFileName: d.invoiceFileName,
    quoteState: d.quoteState,
    quoteStateLabel: d.quoteStateLabel,
    openQuoteId: d.openQuoteId ?? null,
    openQuoteDisplayNumber: d.openQuoteDisplayNumber ?? null,
    shipmentId: d.shipmentId ?? null,
    canRequestQuote: d.canRequestQuote,
    quoteRequestBlocker: d.quoteRequestBlocker ?? null,
  };
}

@Injectable({ providedIn: 'root' })
export class ParcelsService {
  private readonly api = inject(BorderboxApiService);

  readonly parcels = signal<ParcelListItem[]>([]);
  readonly dashboard = signal<DashboardDto | null>(null);
  readonly loading = signal(false);

  loadDashboard(): Observable<DashboardDto> {
    return this.api.getDashboard().pipe(tap((d) => this.dashboard.set(d)));
  }

  seedTestParcels(
    dataset: 'catalog-a' | 'catalog-b' = 'catalog-a',
  ): Observable<{ created: number; totalShippable: number; dataset: string; message: string }> {
    return this.api.seedShippableTestParcels(dataset).pipe(
      switchMap((result) => this.loadParcels().pipe(map(() => result))),
    );
  }

  loadParcels(): Observable<ParcelListItem[]> {
    return this.api.listParcels().pipe(
      map((items) => items.map(mapListItem)),
      tap((items) => this.parcels.set(items)),
    );
  }

  /** Load dashboard + parcel list together so summary and table stay in sync. */
  refreshParcelsPage(): Observable<{ dashboard: DashboardDto; parcels: ParcelListItem[] }> {
    this.loading.set(true);
    return forkJoin({
      dashboard: this.loadDashboard(),
      parcels: this.loadParcels(),
    }).pipe(tap(() => this.loading.set(false)));
  }

  getParcel(id: string): Observable<ParcelDetail> {
    return this.api.getParcel(id).pipe(map((d) => this.mapDetail(d)));
  }

  updatePhysicalAttributes(
    parcelId: string,
    body: { weightKg: number | null; dimensionsLabel: string | null; declaredValueZar: number | null },
  ): Observable<ParcelDetail> {
    return this.api.updateParcelPhysical(parcelId, body).pipe(
      map((d) => this.mapDetail(d)),
      tap((detail) => {
        this.parcels.update((list) =>
          list.map((p) => (p.id === parcelId ? { ...p, ...detail } : p)),
        );
      }),
    );
  }

  private mapDetail(d: ParcelDetailDto): ParcelDetail {
    return {
      ...mapListItem(d),
      suiteNumber: d.suiteNumber,
      dimensionsLabel: d.dimensionsLabel,
      daysInWarehouse: d.daysInWarehouse,
      invoiceFileSizeBytes: d.invoiceFileSizeBytes,
      invoiceUploadedAtUtc: d.invoiceUploadedAtUtc ?? null,
      canUploadInvoice: d.canUploadInvoice,
      invoiceStatus: d.invoiceStatus === 'Uploaded' ? 'Uploaded' : 'Pending',
      invoiceDownloadUrl: d.invoiceDownloadUrl ?? null,
      photos: (d.photos ?? [])
        .filter((ph) => !!ph.url?.trim())
        .map((ph) => ({
          id: ph.id,
          url: ph.url,
          caption: ph.caption,
          capturedAtUtc: ph.capturedAtUtc,
        })),
    };
  }

  uploadInvoice(parcelId: string, file: File): Observable<ParcelDetail> {
    return this.api.uploadParcelInvoice(parcelId, file).pipe(
      switchMap(() => this.getParcel(parcelId)),
      tap(() => this.loadParcels().subscribe()),
    );
  }

  loadInvoicePreview(
    parcelId: string,
    fileName: string | null,
  ): Observable<{ objectUrl: string; isImage: boolean }> {
    return this.api.downloadInvoiceBlob(parcelId).pipe(
      map((blob) => ({
        objectUrl: URL.createObjectURL(blob),
        isImage:
          blob.type.startsWith('image/') ||
          /\.(png|jpe?g|webp|gif|svg)$/i.test(fileName ?? ''),
      })),
    );
  }

  invoiceDownloadPath(parcelId: string, download = false): string {
    const base = this.api.invoiceDownloadUrl(parcelId);
    return download ? `${base}?download=true` : base;
  }

  invoicePreviewPath(parcelId: string): string {
    return `${this.api.invoiceDownloadUrl(parcelId)}?inline=1`;
  }

  summary(items = this.parcels()): ParcelSummary {
    const uploaded = items.filter((p) => p.invoiceStatus === 'Uploaded').length;
    const pending = items.length - uploaded;
    const ready = items.filter((p) => p.status.includes('Ready')).length;
    return { total: items.length, uploaded, pending, ready };
  }

  /** UI helpers */
  displayDate = formatParcelDate;
  displayWeight = formatWeight;
  invoiceUi = invoiceUiStatus;
}
