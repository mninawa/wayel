import { Injectable, inject } from '@angular/core';
import { Observable, from, switchMap } from 'rxjs';
import type {
  Phase1InstitutionDocumentDto,
  Phase1ReplaceInstitutionDocumentBody,
  Phase1TenantDocumentsResult,
  Phase1UploadInstitutionDocumentBody,
  Phase1UploadTicketResponse,
} from '../core/contracts/platform-documents.phase1';
import { PlatformTenantDocumentsApiService } from './platform-tenant-documents-api.service';

/**
 * Orchestrates the multi-step institution-document upload ceremony
 * (mint ticket → PUT bytes → register row) and proxies the simple
 * mutations.
 *
 * Why a bridge: the SPA component is already busy rendering tabs +
 * tiles + drawers; pushing the `fetch(uploadUrl, PUT)` call into a
 * dedicated wrapper keeps the component's HTTP surface narrow and
 * makes the upload path testable in isolation.
 */
@Injectable({ providedIn: 'root' })
export class PlatformTenantDocumentsBridgeService {
  private readonly api = inject(PlatformTenantDocumentsApiService);

  loadForTenant(tenantId: string): Observable<Phase1TenantDocumentsResult> {
    return this.api.listForTenant(tenantId);
  }

  /**
   * End-to-end upload of the FIRST row in a (tenantId, typeCode) slot.
   * Returns the freshly-catalogued row so the SPA can patch its grid
   * in place without a full refetch.
   */
  uploadInstitutionDocument(
    tenantId: string,
    typeCode: string,
    file: File,
    options: { expiresOnUtc?: string | null; notes?: string | null } = {},
  ): Observable<Phase1InstitutionDocumentDto> {
    return this.mintTicketAndPut(tenantId, file).pipe(
      switchMap((ticket) =>
        this.api.uploadInstitutionDocument(tenantId, {
          documentTypeCode: typeCode,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          mediaUrl: ticket.mediaUrl,
          sizeBytes: file.size,
          expiresOnUtc: options.expiresOnUtc ?? null,
          notes: options.notes ?? null,
        }),
      ),
    );
  }

  /**
   * Replace the current row for a (tenantId, typeCode) slot.
   * Delegates to the backend's atomic Replace command — the prior row
   * is soft-deleted and a new row with `versionNumber + 1` is inserted
   * in a single Unit-of-Work.
   */
  replaceInstitutionDocument(
    tenantId: string,
    documentId: string,
    file: File,
    options: { expiresOnUtc?: string | null; notes?: string | null } = {},
  ): Observable<Phase1InstitutionDocumentDto> {
    return this.mintTicketAndPut(tenantId, file).pipe(
      switchMap((ticket) =>
        this.api.replaceInstitutionDocument(tenantId, documentId, {
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          mediaUrl: ticket.mediaUrl,
          sizeBytes: file.size,
          expiresOnUtc: options.expiresOnUtc ?? null,
          notes: options.notes ?? null,
        }),
      ),
    );
  }

  verifyInstitutionDocument(
    tenantId: string,
    documentId: string,
  ): Observable<Phase1InstitutionDocumentDto> {
    return this.api.verifyInstitutionDocument(tenantId, documentId);
  }

  deleteInstitutionDocument(
    tenantId: string,
    documentId: string,
  ): Observable<void> {
    return this.api.deleteInstitutionDocument(tenantId, documentId);
  }

  /**
   * Two-step ceremony: ask the backend for a presigned URL, then PUT
   * the file bytes against it. Returns the ticket so the caller can
   * use its `mediaUrl` to register the row.
   */
  private mintTicketAndPut(
    tenantId: string,
    file: File,
  ): Observable<Phase1UploadTicketResponse> {
    return this.api
      .createUploadTicket(tenantId, {
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
        sizeBytes: file.size,
      })
      .pipe(switchMap((ticket) => from(this.putBytes(ticket, file))));
  }

  private async putBytes(
    ticket: Phase1UploadTicketResponse,
    file: File,
  ): Promise<Phase1UploadTicketResponse> {
    // Always merge the ticket headers (Content-Type, x-amz-* etc.) —
    // skipping any of them invalidates the presigned URL signature.
    const headers = new Headers();
    for (const [key, value] of Object.entries(ticket.headers ?? {})) {
      headers.set(key, value);
    }

    const response = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      body: file,
      headers,
    });

    if (!response.ok) {
      throw new Error(
        `Upload to presigned URL failed (${response.status} ${response.statusText}).`,
      );
    }

    return ticket;
  }
}
