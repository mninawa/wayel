import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PendingKycReviewDto {
  userId: string;
  email: string;
  displayName: string;
  phone: string;
  idDocumentType: string;
  idNumber: string;
  kycStatus: string;
  submittedOnUtc: string;
}

export interface KycReviewActionResultDto {
  userId: string;
  kycStatus: string;
  message: string;
}

import { clearStoredOpsKey, getStoredOpsKey, storeOpsKey } from './ops-api-key';

@Injectable({ providedIn: 'root' })
export class KycOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.useBffAuth
    ? '/api/v1'
    : `${environment.platformApiUrl || ''}/api/v1`.replace(/\/$/, '') || '/api/v1';

  getStoredOpsKey = getStoredOpsKey;
  storeOpsKey = storeOpsKey;
  clearOpsKey = clearStoredOpsKey;

  listPending(opsKey: string): Observable<PendingKycReviewDto[]> {
    return this.http.get<PendingKycReviewDto[]>(`${this.base}/borderbox/ops/kyc/pending`, {
      headers: this.opsHeaders(opsKey),
    });
  }

  approve(userId: string, opsKey: string): Observable<KycReviewActionResultDto> {
    return this.http.post<KycReviewActionResultDto>(
      `${this.base}/borderbox/ops/kyc/${userId}/approve`,
      {},
      { headers: this.opsHeaders(opsKey) },
    );
  }

  reject(userId: string, opsKey: string, reason?: string): Observable<KycReviewActionResultDto> {
    return this.http.post<KycReviewActionResultDto>(
      `${this.base}/borderbox/ops/kyc/${userId}/reject`,
      { reason: reason ?? null },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  private opsHeaders(opsKey: string): HttpHeaders {
    return new HttpHeaders({ 'X-Wayel-Ops-Key': opsKey });
  }
}
