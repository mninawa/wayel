import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { BorderboxMockService } from './borderbox-mock.service';

export interface SuiteAccessSummary {
  status: string;
  canReceiveParcels: boolean;
  canUploadInvoices: boolean;
  canShipOut: boolean;
  shipOutLocked: boolean;
  customerMessage: string;
  suiteNumber: string | null;
  expiresAt: string | null;
}

export interface DashboardDto {
  suiteAccess: SuiteAccessSummary;
  parcelCount: number;
  suiteNumber: string | null;
}

export interface SuitePlanDto {
  id: string;
  name: string;
  durationMonths: number;
  priceZar: number;
  isRecommended: boolean;
}

export interface ParcelDto {
  id: string;
  retailer: string;
  trackingNumber: string | null;
  status: string;
  weightKg: number | null;
  receivedAtUtc: string;
}

/**
 * WeYell API facade. In dev (`environment.useMock`) all calls are served
 * in-memory — no backend or platform-mock-api required.
 */
@Injectable({ providedIn: 'root' })
export class BorderboxApiService {
  private readonly http = inject(HttpClient);
  private readonly mock = inject(BorderboxMockService);
  private readonly base = environment.useBffAuth
    ? '/api/v1'
    : `${environment.platformApiUrl || ''}/api/v1`.replace(/\/$/, '') || '/api/v1';

  getDashboard(): Observable<DashboardDto> {
    if (environment.useMock) return this.mock.getDashboard();
    return this.http.get<DashboardDto>(`${this.base}/borderbox/dashboard`);
  }

  listParcels(): Observable<ParcelDto[]> {
    if (environment.useMock) return this.mock.listParcels();
    return this.http.get<ParcelDto[]>(`${this.base}/borderbox/parcels`);
  }

  listSuitePlans(): Observable<SuitePlanDto[]> {
    if (environment.useMock) return this.mock.listSuitePlans();
    return this.http.get<SuitePlanDto[]>(`${this.base}/borderbox/suite-plans`);
  }

  activateSuite(planId: string): Observable<unknown> {
    if (environment.useMock) return this.mock.activateSuite(planId);
    return this.http.post(`${this.base}/borderbox/suite-access/checkout`, { planId });
  }
}
