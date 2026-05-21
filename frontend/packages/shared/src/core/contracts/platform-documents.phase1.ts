/**
 * Wire shape for the institution-document grid endpoint.
 *
 * Backed by Wayel.Api's
 *   GET /api/v1/admin/tenants/{tenantId:guid}/documents
 *
 * mirrors `Wayel.Application.Features.InstitutionDocuments.ListTenantInstitutionDocuments.TenantInstitutionDocumentsView`
 * 1:1 (camelCase via the default `ConfigureHttpJsonOptions` policy +
 * `JsonStringEnumConverter` for the status enum).
 *
 * The categories + types catalogue is platform-canonical and lives in
 * the backend's `InstitutionDocumentCatalog`; the SPA never has to
 * hard-code them — the categories array on every response carries the
 * tab strip's full layout (slug, icon, sortOrder, tileCount).
 */

export type Phase1DocumentStatus =
  | 'Active'
  | 'Verified'
  | 'ExpiringSoon'
  | 'Expired'
  | 'Missing';

export interface Phase1DocumentCategoryDto {
  code: string;
  /** Stable URL fragment — `?tab=<slug>` deep-links jump to this category. */
  slug: string;
  name: string;
  iconKey: string;
  description: string;
  sortOrder: number;
  tileCount: number;
}

export interface Phase1DocumentRowDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  mediaUrl: string;
  uploadedByUserId: string | null;
  uploadedByDisplayName: string;
  uploadedOnUtc: string;
  expiresOnUtc: string | null;
  verifiedOnUtc: string | null;
  verifiedByUserId: string | null;
  versionNumber: number;
  notes: string | null;
}

export interface Phase1DocumentTileDto {
  documentTypeCode: string;
  categoryCode: string;
  name: string;
  description: string;
  iconKey: string;
  isRequired: boolean;
  defaultExpiryDays: number | null;
  status: Phase1DocumentStatus;
  /**
   * Days from now until `document.expiresOnUtc`. Negative when the
   * document is already expired; null when there is no document or
   * the document type has no expiry policy at all.
   */
  daysUntilExpiry: number | null;
  /** Null on a Missing tile — the SPA renders an upload prompt. */
  document: Phase1DocumentRowDto | null;
}

export interface Phase1DocumentSummaryDto {
  totalTiles: number;
  verifiedCount: number;
  activeCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  missingCount: number;
  /**
   * Required tiles whose status is Missing | Expired | ExpiringSoon —
   * the operator's "you need to act" counter on the page header.
   */
  requiredOutstandingCount: number;
}

export interface Phase1TenantDocumentsResult {
  tenantId: string;
  categories: ReadonlyArray<Phase1DocumentCategoryDto>;
  tiles: ReadonlyArray<Phase1DocumentTileDto>;
  summary: Phase1DocumentSummaryDto;
  generatedOnUtc: string;
}

// ─── Slice-2 mutations ──────────────────────────────────────────────

/**
 * Body for `POST /api/v1/admin/tenants/{tenantId}/documents/upload-ticket`
 * Mirrors `Wayel.Api.Endpoints.CreateInstitutionDocumentUploadTicketBody`.
 */
export interface Phase1CreateUploadTicketBody {
  contentType: string;
  fileName?: string | null;
  sizeBytes?: number | null;
}

export interface Phase1UploadTicketResponse {
  mediaId: string;
  uploadUrl: string;
  mediaUrl: string;
  headers: Record<string, string>;
  expiresAtUtc: string;
}

/**
 * Body for `POST /api/v1/admin/tenants/{tenantId}/documents`
 * Mirrors `Wayel.Api.Endpoints.UploadInstitutionDocumentBody`.
 *
 * `documentTypeCode` is required — the backend rejects upload to a
 * slot that already has a current row; use the replace endpoint
 * instead. `expiresOnUtc` is optional: omitting it stamps the
 * catalogue's `defaultExpiryDays` from now.
 */
export interface Phase1UploadInstitutionDocumentBody {
  documentTypeCode: string;
  fileName: string;
  contentType: string;
  mediaUrl: string;
  sizeBytes?: number | null;
  expiresOnUtc?: string | null;
  notes?: string | null;
}

/**
 * Body for `POST /api/v1/admin/tenants/{tenantId}/documents/{id}/replace`
 * Mirrors `Wayel.Api.Endpoints.ReplaceInstitutionDocumentBody`.
 *
 * `documentTypeCode` is implicit — the new row inherits it from the
 * row being replaced. The handler bumps `versionNumber` and soft
 * deletes the prior row inside one Unit-of-Work.
 */
export interface Phase1ReplaceInstitutionDocumentBody {
  fileName: string;
  contentType: string;
  mediaUrl: string;
  sizeBytes?: number | null;
  expiresOnUtc?: string | null;
  notes?: string | null;
}

/**
 * Wire shape returned from the upload / replace / verify endpoints.
 * Mirrors `Wayel.Application.Features.InstitutionDocuments.Common.InstitutionDocumentDto`.
 */
export interface Phase1InstitutionDocumentDto {
  id: string;
  tenantId: string;
  documentTypeCode: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  mediaUrl: string;
  uploadedByUserId: string | null;
  uploadedByDisplayName: string;
  uploadedOnUtc: string;
  expiresOnUtc: string | null;
  verifiedOnUtc: string | null;
  verifiedByUserId: string | null;
  versionNumber: number;
  notes: string | null;
  deletedOnUtc: string | null;
}
