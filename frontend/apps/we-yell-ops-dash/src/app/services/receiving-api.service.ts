import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';
import { OpsParcelPhotoUploadService } from './ops-parcel-photo-upload.service';
import type {
  OpsParcelDetailDto,
  OpsParcelQueueItemDto,
  OpsReceivingDashboardDto,
  OpsReceivingStatsDto,
  ReceiveParcelRequest,
  ReceiveParcelResultDto,
  SaveInspectionResultDto,
  SendInvoiceUploadReminderResultDto,
  SuiteReceiveLookupDto,
} from './parcel-ops-api.service';

export interface OpsPagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface OpsExceptionItemDto {
  parcelId: string;
  displayId: string;
  trackingNumber: string | null;
  exceptionType: string;
  severity: string;
  status: string;
  retailer: string;
  customerDisplayName: string;
  suiteNumber: string;
  receivedAtUtc: string;
  assignedTo: string | null;
  escalatedTo: string | null;
  dueAtUtc: string | null;
  isOverdue: boolean;
  notes: string | null;
}

export interface OpsAccessDto {
  role: string;
  actor: string;
  capabilities: string[];
  regions: string[];
}

export interface OpsActivityItemDto {
  id: string;
  eventType: string;
  title: string;
  detail: string | null;
  actor: string | null;
  occurredAtUtc: string;
}

export interface OpsPhotoDto {
  photoId: string;
  category: string;
  fileName: string;
  contentType: string;
  uploadedAtUtc: string;
  uploadedBy: string | null;
}

export interface OpsReadyForQuoteItemDto {
  parcelId: string;
  displayId: string;
  customerDisplayName: string;
  suiteNumber: string;
  retailer: string;
  itemName: string;
  weightKg: number | null;
  declaredValueZar: number | null;
  invoiceStatus: string;
  conditionStatus: string;
  quoteReadiness: string;
  receivedAtUtc: string;
}

export interface OpsInspectionDto {
  conditionStatus: string;
  warehouseLocation: string | null;
  packagingType: string | null;
  outerPackagingIntact: boolean;
  sealIntact: boolean;
  labelReadable: boolean;
  goodsAsDescribed: boolean;
  inspectionNotes: string | null;
  inspectedAtUtc: string | null;
  inspectedBy: string | null;
}

export interface SaveInspectionRequest {
  conditionStatus: string;
  warehouseLocation?: string | null;
  packagingType?: string | null;
  outerPackagingIntact: boolean;
  sealIntact: boolean;
  labelReadable: boolean;
  goodsAsDescribed: boolean;
  inspectionNotes?: string | null;
  inspectedBy?: string | null;
}

export interface VerifyInvoiceRequest {
  decision: 'APPROVE' | 'REJECT';
  reason?: string | null;
}

export interface OpsParcelSearchHitDto {
  parcelId: string;
  displayId: string;
  trackingNumber: string | null;
  retailer: string;
  itemName: string;
  customerDisplayName: string;
  suiteNumber: string;
  statusLabel: string;
  receivedAtUtc: string;
}

export interface ConfirmSuiteMatchResultDto {
  parcelId: string;
  suiteNumber: string;
  customerDisplayName: string;
  suiteMatchStatus: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ReceivingApiService {
  private readonly http = inject(HttpClient);
  private readonly photoUploads = inject(OpsParcelPhotoUploadService);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/receiving`;

  getAccess(opsKeyOrToken = ''): Observable<OpsAccessDto> {
    return this.http.get<OpsAccessDto>(`${this.base}/access`, {
      headers: this.opsHeaders(opsKeyOrToken),
    });
  }

  getDashboard(opsKey: string, limit = 50): Observable<OpsReceivingDashboardDto> {
    return this.http.get<OpsReceivingDashboardDto>(`${this.base}/dashboard`, {
      headers: this.opsHeaders(opsKey),
      params: { limit },
    });
  }

  search(query: string, opsKey: string, limit = 30): Observable<OpsParcelSearchHitDto[]> {
    return this.http.get<OpsParcelSearchHitDto[]>(`${this.base}/search`, {
      headers: this.opsHeaders(opsKey),
      params: { q: query.trim(), limit },
    });
  }

  confirmSuiteMatch(
    parcelId: string,
    suiteNumber: string,
    opsKey: string,
  ): Observable<ConfirmSuiteMatchResultDto> {
    return this.http.post<ConfirmSuiteMatchResultDto>(
      `${this.base}/parcels/${parcelId}/suite-match`,
      { suiteNumber },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  listExceptions(
    opsKey: string,
    page = 1,
    pageSize = 25,
  ): Observable<OpsPagedResult<OpsExceptionItemDto>> {
    return this.http.get<OpsPagedResult<OpsExceptionItemDto>>(`${this.base}/exceptions`, {
      headers: this.opsHeaders(opsKey),
      params: { page, pageSize },
    });
  }

  listReadyForQuote(
    opsKey: string,
    page = 1,
    pageSize = 25,
  ): Observable<OpsPagedResult<OpsReadyForQuoteItemDto>> {
    return this.http.get<OpsPagedResult<OpsReadyForQuoteItemDto>>(`${this.base}/ready-for-quote`, {
      headers: this.opsHeaders(opsKey),
      params: { page, pageSize },
    });
  }

  getParcel(parcelId: string, opsKey: string): Observable<OpsParcelDetailDto> {
    return this.http.get<OpsParcelDetailDto>(`${this.base}/parcels/${parcelId}`, {
      headers: this.opsHeaders(opsKey),
    });
  }

  intake(body: ReceiveParcelRequest, opsKey: string): Observable<ReceiveParcelResultDto> {
    return this.http.post<ReceiveParcelResultDto>(`${this.base}/parcels/intake`, body, {
      headers: this.opsHeaders(opsKey),
    });
  }

  lookupSuite(suiteNumber: string, opsKey: string): Observable<SuiteReceiveLookupDto> {
    const encoded = encodeURIComponent(suiteNumber.trim());
    return this.http.get<SuiteReceiveLookupDto>(
      `${environment.apiBaseUrl}/borderbox/ops/parcels/suite-lookup/${encoded}`,
      { headers: this.opsHeaders(opsKey) },
    );
  }

  verifyInvoice(
    parcelId: string,
    body: VerifyInvoiceRequest,
    opsKey: string,
  ): Observable<{ parcelId: string; invoiceStatus: string; quoteReadiness: string; message: string }> {
    return this.http.post<{ parcelId: string; invoiceStatus: string; quoteReadiness: string; message: string }>(
      `${this.base}/parcels/${parcelId}/invoice/verify`,
      body,
      { headers: this.opsHeaders(opsKey) },
    );
  }

  saveInspection(
    parcelId: string,
    body: SaveInspectionRequest,
    opsKey: string,
  ): Observable<SaveInspectionResultDto> {
    return this.http.post<SaveInspectionResultDto>(
      `${this.base}/parcels/${parcelId}/inspection`,
      body,
      { headers: this.opsHeaders(opsKey) },
    );
  }

  sendInvoiceUploadReminder(
    parcelId: string,
    opsKey: string,
    forceResend = false,
  ): Observable<SendInvoiceUploadReminderResultDto> {
    return this.http.post<SendInvoiceUploadReminderResultDto>(
      `${this.base}/parcels/${parcelId}/invoice/upload-reminder`,
      { forceResend },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  assignException(
    parcelId: string,
    exceptionType: string,
    assignedTo: string,
    opsKey: string,
  ): Observable<{ message: string }> {
    const type = encodeURIComponent(exceptionType);
    return this.http.post<{ message: string }>(
      `${this.base}/exceptions/${parcelId}/${type}/assign`,
      { assignedTo },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  escalateException(
    parcelId: string,
    exceptionType: string,
    escalatedTo: string,
    notes: string | null,
    opsKey: string,
  ): Observable<{ message: string }> {
    const type = encodeURIComponent(exceptionType);
    return this.http.post<{ message: string }>(
      `${this.base}/exceptions/${parcelId}/${type}/escalate`,
      { escalatedTo, notes },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  resolveException(
    parcelId: string,
    exceptionType: string,
    notes: string | null,
    opsKey: string,
  ): Observable<{ message: string }> {
    const type = encodeURIComponent(exceptionType);
    return this.http.post<{ message: string }>(
      `${this.base}/exceptions/${parcelId}/${type}/resolve`,
      { notes },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  listActivity(parcelId: string, opsKey: string): Observable<OpsActivityItemDto[]> {
    return this.http.get<OpsActivityItemDto[]>(`${this.base}/parcels/${parcelId}/activity`, {
      headers: this.opsHeaders(opsKey),
    });
  }

  downloadInvoiceBlob(parcelId: string, opsKey: string): Observable<Blob> {
    return this.http.get(`${this.base}/parcels/${parcelId}/invoice/file`, {
      headers: this.opsHeaders(opsKey),
      responseType: 'blob',
    });
  }

  uploadInvoice(parcelId: string, file: File, opsKey: string): Observable<{
    parcelId: string;
    invoiceStatus: string;
    fileName: string;
    uploadedAtUtc: string;
    message: string;
  }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<{
      parcelId: string;
      invoiceStatus: string;
      fileName: string;
      uploadedAtUtc: string;
      message: string;
    }>(`${this.base}/parcels/${parcelId}/invoice/upload`, form, {
      headers: this.opsHeaders(opsKey),
    });
  }

  listPhotos(parcelId: string, opsKey: string, category?: string): Observable<OpsPhotoDto[]> {
    return this.http.get<OpsPhotoDto[]>(`${this.base}/parcels/${parcelId}/photos`, {
      headers: this.opsHeaders(opsKey),
      params: category ? { category } : {},
    });
  }

  uploadPhoto(parcelId: string, category: 'INTAKE' | 'INSPECTION', file: File, opsKey: string): Observable<OpsPhotoDto> {
    return this.photoUploads.upload(parcelId, category, file, opsKey);
  }

  deletePhoto(photoId: string, opsKey: string): Observable<{ photoId: string; message: string }> {
    return this.http.delete<{ photoId: string; message: string }>(`${this.base}/photos/${photoId}`, {
      headers: this.opsHeaders(opsKey),
    });
  }

  photoFileUrl(photoId: string, opsKey: string): string {
    return `${this.base}/photos/${photoId}/file`;
  }

  photoHeaders(opsKey: string): HttpHeaders {
    return this.opsHeaders(opsKey);
  }

  sendToQuoteQueue(
    parcelIds: string[],
    opsKey: string,
  ): Observable<{ parcelIds: string[]; sentCount: number; message: string }> {
    return this.http.post<{ parcelIds: string[]; sentCount: number; message: string }>(
      `${this.base}/quote-queue`,
      { parcelIds },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  private opsHeaders(opsKeyOrToken: string): HttpHeaders {
    return buildOpsHeaders(opsKeyOrToken);
  }
}

export type {
  OpsReceivingDashboardDto,
  OpsReceivingStatsDto,
  OpsParcelQueueItemDto,
  OpsParcelDetailDto,
  ReceiveParcelRequest,
  ReceiveParcelResultDto,
  SuiteReceiveLookupDto,
};
