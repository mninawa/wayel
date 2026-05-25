import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface OpsShipmentListItemDto {
  shipmentId: string;
  status: string;
  statusLabel: string;
  customerDisplayName: string;
  customerEmail: string;
  primaryTrackingNumber: string | null;
  parcelCount: number;
  deliveryMethod: string;
  lastEventAtUtc: string | null;
}

export interface UpdateOpsShipmentStatusResultDto {
  shipmentId: string;
  status: string;
  statusLabel: string;
  eventLabel: string;
  occurredAtUtc: string;
}

@Injectable({ providedIn: 'root' })
export class ShipmentOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listShipments(opsKey: string, limit = 50): Observable<OpsShipmentListItemDto[]> {
    return this.http.get<OpsShipmentListItemDto[]>(`${this.base}/borderbox/ops/shipments`, {
      headers: this.opsHeaders(opsKey),
      params: { limit },
    });
  }

  updateStatus(
    shipmentId: string,
    body: { status: string; location?: string | null; details?: string | null },
    opsKey: string,
  ): Observable<UpdateOpsShipmentStatusResultDto> {
    return this.http.post<UpdateOpsShipmentStatusResultDto>(
      `${this.base}/borderbox/ops/shipments/${shipmentId}/status`,
      body,
      { headers: this.opsHeaders(opsKey) },
    );
  }

  private opsHeaders(opsKey: string): HttpHeaders {
    return buildOpsHeaders(opsKey);
  }
}
