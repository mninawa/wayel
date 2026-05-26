import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface PayLaterStatsDto {
  totalEver: number;
  currentlyPending: number;
  resolvedTotal: number;
  resolvedLast7Days: number;
  newLast7Days: number;
  stalePending: number;
  averageHoursToResolve: number | null;
}

export type PayLaterStatusFilter = 'pending' | 'resolved' | 'all';

export interface PayLaterIntentRow {
  userId: string;
  email: string;
  displayName: string;
  phone: string;
  destinationCountryCode: string;
  createdAtUtc: string;
  lastSeenAtUtc: string;
  resolvedAtUtc: string | null;
  planAtSignalLabel: string | null;
  daysWaiting: number;
  status: 'pending' | 'resolved';
}

export interface PayLaterIntentsPage {
  items: PayLaterIntentRow[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class OnboardingOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/onboarding`;

  getPayLaterStats(opsKey: string): Observable<PayLaterStatsDto> {
    return this.http.get<PayLaterStatsDto>(`${this.base}/pay-later/stats`, {
      headers: buildOpsHeaders(opsKey),
    });
  }

  listPayLater(
    opsKey: string,
    status: PayLaterStatusFilter,
    page: number,
    pageSize: number,
  ): Observable<PayLaterIntentsPage> {
    const params = new URLSearchParams({
      status,
      page: String(page),
      pageSize: String(pageSize),
    });
    return this.http.get<PayLaterIntentsPage>(
      `${this.base}/pay-later?${params.toString()}`,
      { headers: buildOpsHeaders(opsKey) },
    );
  }
}
