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

export interface OpsShipmentTrackingMilestoneDto {
  label: string;
  icon: string;
  done: boolean;
  current: boolean;
  occurredAtUtc: string | null;
}

export interface OpsShipmentTrackingParcelRowDto {
  trackingNumber: string;
  itemName: string;
  weightKg: number | null;
  status: string;
  statusLabel: string;
}

export interface OpsShipmentTrackingHistoryEventDto {
  occurredAtUtc: string;
  eventLabel: string;
  eventTone: string;
  location: string;
  details: string;
}

export interface OpsCourierInfoDto { name: string; website: string; phone: string; }
export interface OpsRecipientInfoDto { name: string; phone: string; address: string; }

export interface OpsShipmentTrackingDetailDto {
  shipmentId: string;
  trackingNumber: string;
  status: string;
  statusLabel: string;
  deliveryMethod: string;
  estimatedDelivery: string;
  originLabel: string;
  destinationLabel: string;
  parcelCount: number;
  totalWeightLabel: string;
  declaredValueLabel: string;
  milestones: OpsShipmentTrackingMilestoneDto[];
  parcels: OpsShipmentTrackingParcelRowDto[];
  courier: OpsCourierInfoDto;
  recipient: OpsRecipientInfoDto;
  history: OpsShipmentTrackingHistoryEventDto[];
  timezoneNote: string;
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

  getTrackingDetail(
    shipmentId: string,
    opsKey: string,
  ): Observable<OpsShipmentTrackingDetailDto> {
    return this.http.get<OpsShipmentTrackingDetailDto>(
      `${this.base}/borderbox/ops/shipments/${shipmentId}/tracking`,
      { headers: this.opsHeaders(opsKey) },
    );
  }

  private opsHeaders(opsKey: string): HttpHeaders {
    return buildOpsHeaders(opsKey);
  }
}
