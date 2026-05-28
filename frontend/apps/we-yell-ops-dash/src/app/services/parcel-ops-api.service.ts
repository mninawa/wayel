import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { clearStoredOpsKey, getStoredOpsKey, storeOpsKey } from './ops-api-key';
import { buildOpsHeaders } from './ops-request-headers';

export interface ReceiveParcelRequest {
  suiteNumber: string;
  retailer: string;
  trackingNumber: string | null;
  itemName: string;
  category: string;
  declaredValueZar: number | null;
  dimensionsLabel: string | null;
  weightKg: number | null;
}

export interface SuiteReceiveLookupDto {
  suiteNumber: string;
  customerUserId: string;
  customerEmail: string;
  customerDisplayName: string;
  suiteAccessStatus: string;
  canReceiveParcels: boolean;
  customerMessage: string;
}

export interface ReceiveParcelResultDto {
  parcelId: string;
  suiteNumber: string;
  customerEmail: string;
  customerDisplayName: string;
  trackingNumber: string | null;
  itemName: string;
  status: string;
  receivedAtUtc: string;
  invoiceReminderWhatsAppStatus: string;
  invoiceReminderWhatsAppDetail: string | null;
}

export interface SaveInspectionResultDto {
  parcelId: string;
  conditionStatus: string;
  quoteReadiness: string;
  inspectedAtUtc: string;
  invoiceReminderWhatsAppStatus: string;
  invoiceReminderWhatsAppDetail: string | null;
}

export interface SendInvoiceUploadReminderResultDto {
  parcelId: string;
  invoiceReminderWhatsAppStatus: string;
  invoiceReminderWhatsAppDetail: string | null;
  message: string;
}

export interface OpsReceivingStatsDto {
  receivedToday: number;
  unmatchedParcels: number;
  awaitingInvoice: number;
  readyForQuote: number;
  exceptions: number;
}

export interface OpsParcelQueueItemDto {
  parcelId: string;
  displayId: string;
  trackingNumber: string | null;
  retailer: string;
  itemName: string;
  customerDisplayName: string;
  customerEmail: string;
  suiteNumber: string;
  suiteMatchStatus: string;
  invoiceStatus: string;
  conditionStatus: string;
  status: string;
  statusLabel: string;
  receivedAtUtc: string;
}

export interface OpsReceivingDashboardDto {
  stats: OpsReceivingStatsDto;
  queue: OpsParcelQueueItemDto[];
}

export interface OpsParcelDetailDto {
  parcelId: string;
  displayId: string;
  customerDisplayName: string;
  customerEmail: string;
  customerPhone: string | null;
  suiteNumber: string;
  retailer: string;
  trackingNumber: string | null;
  itemName: string;
  category: string;
  status: string;
  statusLabel: string;
  weightKg: number | null;
  declaredValueZar: number | null;
  dimensionsLabel: string | null;
  receivedAtUtc: string;
  daysInWarehouse: number;
  invoiceStatus: string;
  invoiceFileName: string | null;
  invoiceUploadedAtUtc: string | null;
  quoteState: string;
  quoteStateLabel: string;
  shipmentId: string | null;
  quoteReadiness: string;
  readinessBlockers: string[];
  inspection: OpsInspectionDto | null;
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

@Injectable({ providedIn: 'root' })
export class ParcelOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  getStoredOpsKey = getStoredOpsKey;
  storeOpsKey = storeOpsKey;
  clearOpsKey = clearStoredOpsKey;

  getDashboard(opsKey: string, limit = 50): Observable<OpsReceivingDashboardDto> {
    return this.http.get<OpsReceivingDashboardDto>(`${this.base}/borderbox/ops/parcels`, {
      headers: this.opsHeaders(opsKey),
      params: { limit },
    });
  }

  getParcel(parcelId: string, opsKey: string): Observable<OpsParcelDetailDto> {
    return this.http.get<OpsParcelDetailDto>(`${this.base}/borderbox/ops/parcels/${parcelId}`, {
      headers: this.opsHeaders(opsKey),
    });
  }

  lookupSuite(suiteNumber: string, opsKey: string): Observable<SuiteReceiveLookupDto> {
    const encoded = encodeURIComponent(suiteNumber.trim());
    return this.http.get<SuiteReceiveLookupDto>(
      `${this.base}/borderbox/ops/parcels/suite-lookup/${encoded}`,
      { headers: this.opsHeaders(opsKey) },
    );
  }

  receive(body: ReceiveParcelRequest, opsKey: string): Observable<ReceiveParcelResultDto> {
    return this.http.post<ReceiveParcelResultDto>(
      `${this.base}/borderbox/ops/parcels/receive`,
      body,
      { headers: this.opsHeaders(opsKey) },
    );
  }

  private opsHeaders(opsKey: string): HttpHeaders {
    return buildOpsHeaders(opsKey);
  }
}
