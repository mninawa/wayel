import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface SuitePlanAdminDto {
  id: string;
  name: string;
  durationMonths: number;
  priceZar: number;
  isRecommended: boolean;
  isActive: boolean;
  paystackPlanCode: string | null;
}

export interface CreateSuitePlanRequest {
  name: string;
  durationMonths: number;
  priceZar: number;
  isRecommended: boolean;
  paystackPlanCode?: string | null;
}

export type UpdateSuitePlanRequest = CreateSuitePlanRequest;

export interface ReconcileSuitePlansPaystackResult {
  plansUpdated: number;
}

@Injectable({ providedIn: 'root' })
export class SuitePlansOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/borderbox/ops/plans`;

  list(): Observable<SuitePlanAdminDto[]> {
    return this.http.get<SuitePlanAdminDto[]>(this.base, { headers: buildOpsHeaders() });
  }

  create(body: CreateSuitePlanRequest): Observable<SuitePlanAdminDto> {
    return this.http.post<SuitePlanAdminDto>(this.base, body, { headers: buildOpsHeaders() });
  }

  update(planId: string, body: UpdateSuitePlanRequest): Observable<SuitePlanAdminDto> {
    return this.http.put<SuitePlanAdminDto>(`${this.base}/${planId}`, body, {
      headers: buildOpsHeaders(),
    });
  }

  activate(planId: string): Observable<SuitePlanAdminDto> {
    return this.http.post<SuitePlanAdminDto>(
      `${this.base}/${planId}/activate`,
      {},
      { headers: buildOpsHeaders() },
    );
  }

  deactivate(planId: string): Observable<SuitePlanAdminDto> {
    return this.http.post<SuitePlanAdminDto>(
      `${this.base}/${planId}/deactivate`,
      {},
      { headers: buildOpsHeaders() },
    );
  }

  syncPaystack(): Observable<ReconcileSuitePlansPaystackResult> {
    return this.http.post<ReconcileSuitePlansPaystackResult>(
      `${this.base}/sync-paystack`,
      {},
      { headers: buildOpsHeaders() },
    );
  }
}
