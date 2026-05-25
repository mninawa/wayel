import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';
import type { OpsPagedResult } from './receiving-api.service';

export interface OpsConsolidationInventoryItemDto {
  parcelId: string;
  displayId: string;
  trackingNumber: string | null;
  customerDisplayName: string;
  suiteNumber: string;
  retailer: string;
  itemName: string;
  status: string;
  warehouseLocation: string | null;
  daysInWarehouse: number;
  weightKg: number | null;
  quoteReadiness: string;
  receivedAtUtc: string;
}

export interface UpdateStorageLocationResultDto {
  parcelId: string;
  warehouseLocation: string | null;
  message: string;
}

export interface OpsConsolidationPickParcelDto {
  parcelId: string;
  displayId: string;
  itemName: string;
  warehouseLocation: string | null;
  weightKg: number | null;
}

export interface OpsConsolidationReadyShipmentDto {
  shipmentId: string;
  customerDisplayName: string;
  suiteNumber: string;
  deliveryMethod: string;
  parcelCount: number;
  totalWeightKg: number;
  readyForDispatch: boolean;
  paidAtUtc: string | null;
  parcels: OpsConsolidationPickParcelDto[];
}

export type ConsolidationShipmentStage = 'awaiting_pack' | 'ready';

@Injectable({ providedIn: 'root' })
export class ConsolidationApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/consolidation`;

  listInventory(
    opsKey: string,
    page = 1,
    pageSize = 25,
    suite?: string,
    location?: string,
  ): Observable<OpsPagedResult<OpsConsolidationInventoryItemDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    const suiteTrim = suite?.trim();
    const locationTrim = location?.trim();
    if (suiteTrim) params['suite'] = suiteTrim;
    if (locationTrim) params['location'] = locationTrim;

    return this.http.get<OpsPagedResult<OpsConsolidationInventoryItemDto>>(`${this.base}/inventory`, {
      headers: buildOpsHeaders(opsKey),
      params,
    });
  }

  updateStorageLocation(
    parcelId: string,
    warehouseLocation: string | null,
    opsKey: string,
  ): Observable<UpdateStorageLocationResultDto> {
    return this.http.patch<UpdateStorageLocationResultDto>(
      `${this.base}/parcels/${parcelId}/location`,
      { warehouseLocation },
      { headers: buildOpsHeaders(opsKey) },
    );
  }

  listReadyShipments(
    opsKey: string,
    page = 1,
    pageSize = 25,
    stage?: ConsolidationShipmentStage,
  ): Observable<OpsPagedResult<OpsConsolidationReadyShipmentDto>> {
    const params: Record<string, string | number> = { page, pageSize };
    if (stage) params['stage'] = stage;
    return this.http.get<OpsPagedResult<OpsConsolidationReadyShipmentDto>>(
      `${this.base}/ready-shipments`,
      { headers: buildOpsHeaders(opsKey), params },
    );
  }

  markPacked(shipmentId: string, notes: string | null, opsKey: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.base}/shipments/${shipmentId}/mark-packed`,
      { notes },
      { headers: buildOpsHeaders(opsKey) },
    );
  }

  dispatchBatch(
    shipmentIds: string[],
    courierReference: string | null,
    opsKey: string,
  ): Observable<{ message: string; dispatchedCount: number }> {
    return this.http.post<{ message: string; dispatchedCount: number }>(
      `${this.base}/dispatch-batch`,
      { shipmentIds, courierReference },
      { headers: buildOpsHeaders(opsKey) },
    );
  }
}
