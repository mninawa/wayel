import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { clearStoredOpsKey, getStoredOpsKey, storeOpsKey } from './ops-api-key';

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
}

@Injectable({ providedIn: 'root' })
export class ParcelOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.useBffAuth
    ? '/api/v1'
    : `${environment.platformApiUrl || ''}/api/v1`.replace(/\/$/, '') || '/api/v1';

  getStoredOpsKey = getStoredOpsKey;
  storeOpsKey = storeOpsKey;
  clearOpsKey = clearStoredOpsKey;

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
    return new HttpHeaders({ 'X-Wayel-Ops-Key': opsKey });
  }
}
