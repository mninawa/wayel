import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';
import type {
  Phase1CreateUploadTicketBody,
  Phase1InstitutionDocumentDto,
  Phase1ReplaceInstitutionDocumentBody,
  Phase1TenantDocumentsResult,
  Phase1UploadInstitutionDocumentBody,
  Phase1UploadTicketResponse,
} from '../core/contracts/platform-documents.phase1';

/**
 * SuperAdmin / TenantAdmin-side HTTP client for the institution-document
 * surface. Mirrors `Wayel.Api.Endpoints.AdminTenantDocumentsEndpoints`
 * 1:1 — the same BFF cookie session that powers the admin/tenants list
 * is required to reach this surface.
 *
 * Scope:
 * - `listForTenant`         GET    /admin/tenants/{tenantId}/documents
 * - `createUploadTicket`    POST   /admin/tenants/{tenantId}/documents/upload-ticket
 * - `uploadInstitutionDoc`  POST   /admin/tenants/{tenantId}/documents
 * - `replaceInstitutionDoc` POST   /admin/tenants/{tenantId}/documents/{id}/replace
 * - `verifyInstitutionDoc`  POST   /admin/tenants/{tenantId}/documents/{id}/verify
 * - `deleteInstitutionDoc`  DELETE /admin/tenants/{tenantId}/documents/{id}
 *
 * The two-step upload ceremony is identical to the child-document
 * flow: mint a ticket, PUT the bytes to the presigned URL, then POST
 * the JSON register call. `putBytes` lives in the bridge so this
 * service stays an HTTP-shape mirror of the backend.
 */
@Injectable({ providedIn: 'root' })
export class PlatformTenantDocumentsApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  private tenantBase(tenantId: string): string {
    return `${this.base()}/api/v1/admin/tenants/${encodeURIComponent(tenantId)}/documents`;
  }

  listForTenant(tenantId: string): Observable<Phase1TenantDocumentsResult> {
    return this.http.get<Phase1TenantDocumentsResult>(
      `${this.tenantBase(tenantId)}/`,
    );
  }

  createUploadTicket(
    tenantId: string,
    body: Phase1CreateUploadTicketBody,
  ): Observable<Phase1UploadTicketResponse> {
    return this.http.post<Phase1UploadTicketResponse>(
      `${this.tenantBase(tenantId)}/upload-ticket`,
      body,
    );
  }

  uploadInstitutionDocument(
    tenantId: string,
    body: Phase1UploadInstitutionDocumentBody,
  ): Observable<Phase1InstitutionDocumentDto> {
    return this.http.post<Phase1InstitutionDocumentDto>(
      `${this.tenantBase(tenantId)}/`,
      body,
    );
  }

  replaceInstitutionDocument(
    tenantId: string,
    documentId: string,
    body: Phase1ReplaceInstitutionDocumentBody,
  ): Observable<Phase1InstitutionDocumentDto> {
    return this.http.post<Phase1InstitutionDocumentDto>(
      `${this.tenantBase(tenantId)}/${encodeURIComponent(documentId)}/replace`,
      body,
    );
  }

  verifyInstitutionDocument(
    tenantId: string,
    documentId: string,
  ): Observable<Phase1InstitutionDocumentDto> {
    return this.http.post<Phase1InstitutionDocumentDto>(
      `${this.tenantBase(tenantId)}/${encodeURIComponent(documentId)}/verify`,
      {},
    );
  }

  deleteInstitutionDocument(
    tenantId: string,
    documentId: string,
  ): Observable<void> {
    return this.http.delete<void>(
      `${this.tenantBase(tenantId)}/${encodeURIComponent(documentId)}`,
    );
  }
}
