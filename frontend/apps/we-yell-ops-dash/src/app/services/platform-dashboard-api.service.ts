import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface PlatformDashboardMetricDto {
  label: string;
  value: string;
  trend?: string | null;
  trendTone?: 'green' | 'amber' | 'red' | null;
  sub?: string | null;
  subTone?: 'green' | 'amber' | 'red' | null;
  icon: string;
  tone: string;
}

export interface PlatformRevenueMonthDto {
  label: string;
  suiteRevenueZar: number;
  shipmentRevenueZar: number;
}

export interface PlatformForecastItemDto {
  label: string;
  value: string;
  badge?: string | null;
  badgeTone?: 'green' | 'amber' | 'red' | null;
}

export interface PlatformRevenueBreakdownDto {
  label: string;
  pct: number;
  amountZar: number;
  color: string;
}

export interface PlatformSuitePerformanceDto {
  label: string;
  value: string;
  trend?: string | null;
  tone: 'green' | 'amber' | 'red';
}

export interface PlatformShipmentBatchDto {
  id: string;
  destination: string;
  flag: string;
  parcels: number;
  revenueZar: number;
  dispatchDate: string;
  status: string;
  statusTone: 'green' | 'amber' | 'orange';
}

export interface PlatformCorridorDto {
  route: string;
  revenueZar: number;
  pct: number;
}

export interface PlatformQuoteBucketDto {
  label: string;
  count: number;
  revenueZar: number;
}

export interface PlatformExpiredCustomerDto {
  customer: string;
  parcels: number;
  daysExpired: number;
}

export interface PlatformDashboardDto {
  scopeLabel: string;
  metrics: PlatformDashboardMetricDto[];
  revenueMonths: PlatformRevenueMonthDto[];
  forecastItems: PlatformForecastItemDto[];
  revenueBreakdown: PlatformRevenueBreakdownDto[];
  donutGradient: string;
  donutTotalLabel: string;
  suitePerformance: PlatformSuitePerformanceDto[];
  shipmentBatches: PlatformShipmentBatchDto[];
  shipmentBatchParcelTotal: number;
  shipmentBatchRevenueTotalZar: number;
  corridors: PlatformCorridorDto[];
  quoteBuckets: PlatformQuoteBucketDto[];
  quotesPendingTotal: number;
  expiredCustomers: PlatformExpiredCustomerDto[];
  expiredAttentionTotal: number;
}

@Injectable({ providedIn: 'root' })
export class PlatformDashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/platform`;

  getDashboard(opsKey: string): Observable<PlatformDashboardDto> {
    return this.http.get<PlatformDashboardDto>(`${this.base}/dashboard`, {
      headers: buildOpsHeaders(opsKey),
    });
  }
}
