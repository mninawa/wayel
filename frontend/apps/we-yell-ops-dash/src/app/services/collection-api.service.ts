import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface OpsCollectionBoardCardDto {
  cardKey: string;
  columnId: string;
  shipmentId: string;
  displayId: string;
  customerDisplayName: string;
  suiteNumber: string | null;
  hubId: string;
  hubName: string;
  hubCity: string;
  parcelCount: number;
  statusLabel: string;
  eventAtUtc: string;
  readyForCollectionAtUtc: string | null;
  collectedAtUtc: string | null;
  notificationSent: boolean;
  collectorIdType: string | null;
  collectorIdNumberMasked: string | null;
  coverPhotoId?: string | null;
}

export interface OpsCollectionBoardColumnDto {
  columnId: string;
  label: string;
  subtitle: string;
  count: number;
  cards: OpsCollectionBoardCardDto[];
}

export interface OpsCollectionBoardDto {
  columns: OpsCollectionBoardColumnDto[];
  hubOptions: string[];
}

export interface OpsCollectionScanResultDto {
  shipmentId: string;
  displayId: string;
  columnId: string;
  hubName: string;
  message: string;
  notificationSent: boolean;
}

export interface OpsCollectionPickupResultDto {
  shipmentId: string;
  displayId: string;
  message: string;
}

export interface OpsCollectionMoveResultDto {
  shipmentId: string;
  displayId: string;
  columnId: string;
  message: string;
  notificationSent: boolean;
}

export interface OpsCollectionBulkAdvanceResultDto {
  movedCount: number;
  skippedCount: number;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class CollectionApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/collection`;

  getBoard(params?: { search?: string; hubCity?: string }): Observable<OpsCollectionBoardDto> {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.hubCity) q.set('hubCity', params.hubCity);
    const suffix = q.toString() ? `?${q}` : '';
    return this.http.get<OpsCollectionBoardDto>(`${this.base}/board${suffix}`, {
      headers: buildOpsHeaders(),
    });
  }

  scanArrival(scanValue: string, hubCity?: string): Observable<OpsCollectionScanResultDto> {
    return this.http.post<OpsCollectionScanResultDto>(
      `${this.base}/scan-arrival`,
      { scanValue, hubCity: hubCity || null },
      { headers: buildOpsHeaders() },
    );
  }

  confirmPickup(body: {
    shipmentId: string;
    idDocumentType: 'NationalId' | 'Passport';
    idNumber: string;
    collectorName?: string;
  }): Observable<OpsCollectionPickupResultDto> {
    return this.http.post<OpsCollectionPickupResultDto>(
      `${this.base}/confirm-pickup`,
      body,
      { headers: buildOpsHeaders() },
    );
  }

  moveBoardItem(body: {
    shipmentId: string;
    fromColumnId: string;
    toColumnId: string;
    hubCity?: string;
  }): Observable<OpsCollectionMoveResultDto> {
    return this.http.post<OpsCollectionMoveResultDto>(
      `${this.base}/board/move`,
      {
        shipmentId: body.shipmentId,
        fromColumnId: body.fromColumnId,
        toColumnId: body.toColumnId,
        hubCity: body.hubCity ?? null,
      },
      { headers: buildOpsHeaders() },
    );
  }

  bulkAdvanceColumn(columnId: string, hubCity?: string): Observable<OpsCollectionBulkAdvanceResultDto> {
    return this.http.post<OpsCollectionBulkAdvanceResultDto>(
      `${this.base}/board/bulk-advance`,
      { columnId, hubCity: hubCity ?? null },
      { headers: buildOpsHeaders() },
    );
  }
}
