import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { buildOpsHeaders } from './ops-request-headers';

export interface PendingKycReviewDto {
  userId: string;
  email: string;
  displayName: string;
  phone: string;
  idDocumentType: string;
  idNumber: string;
  kycStatus: string;
  submittedOnUtc: string;
  riskLevel: 'Low' | 'Medium' | 'High';
}

export interface KycDocumentDto {
  documentId: string;
  side: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAtUtc: string;
  confirmed: boolean;
  downloadUrl: string | null;
}

export interface KycVerificationCheckDto {
  type: string;
  status: string;
  detail: string | null;
  completedAtUtc: string | null;
}

export interface OpsKycSubmissionDetailDto {
  userId: string;
  email: string;
  displayName: string;
  phone: string;
  destinationCountryCode: string;
  destinationCountryLabel: string;
  idDocumentType: string;
  idNumber: string;
  kycStatus: string;
  submittedAtUtc: string | null;
  memberSinceUtc: string;
  suiteNumber: string | null;
  rejectionReason: string | null;
  reviewerNotes: string | null;
  faceMatchScore: number | null;
  idDocumentExpiryUtc: string | null;
  documents: KycDocumentDto[];
  checks: KycVerificationCheckDto[];
}

export interface KycReviewActionResultDto {
  userId: string;
  kycStatus: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class KycOpsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listPending(opsKey: string): Observable<PendingKycReviewDto[]> {
    return this.http.get<PendingKycReviewDto[]>(`${this.base}/borderbox/ops/kyc/pending`, {
      headers: this.opsHeaders(opsKey),
    });
  }

  getDetail(userId: string, opsKey: string): Observable<OpsKycSubmissionDetailDto> {
    return this.http.get<OpsKycSubmissionDetailDto>(`${this.base}/borderbox/ops/kyc/${userId}`, {
      headers: this.opsHeaders(opsKey),
    });
  }

  downloadDocument(userId: string, documentId: string, opsKey: string): Observable<Blob> {
    return this.http.get(`${this.base}/borderbox/ops/kyc/${userId}/documents/${documentId}`, {
      headers: this.opsHeaders(opsKey),
      responseType: 'blob',
    });
  }

  runChecks(userId: string, opsKey: string): Observable<OpsKycSubmissionDetailDto> {
    return this.http.post<OpsKycSubmissionDetailDto>(
      `${this.base}/borderbox/ops/kyc/${userId}/run-checks`,
      {},
      { headers: this.opsHeaders(opsKey) },
    );
  }

  approve(userId: string, opsKey: string, reviewerNotes?: string): Observable<KycReviewActionResultDto> {
    return this.http.post<KycReviewActionResultDto>(
      `${this.base}/borderbox/ops/kyc/${userId}/approve`,
      { reviewerNotes: reviewerNotes ?? null },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  reject(
    userId: string,
    opsKey: string,
    reason?: string,
    reviewerNotes?: string,
  ): Observable<KycReviewActionResultDto> {
    return this.http.post<KycReviewActionResultDto>(
      `${this.base}/borderbox/ops/kyc/${userId}/reject`,
      { reason: reason ?? null, reviewerNotes: reviewerNotes ?? null },
      { headers: this.opsHeaders(opsKey) },
    );
  }

  private opsHeaders(opsKey: string): HttpHeaders {
    return buildOpsHeaders(opsKey);
  }
}
