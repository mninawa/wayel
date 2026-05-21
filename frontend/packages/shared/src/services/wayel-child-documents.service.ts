import { Injectable, inject } from '@angular/core';
import {
  WayelAdminMediaService,
  type WayelMediaUploadTicket,
} from './wayel-admin-media.service';
import { wayelAdminFetch } from './wayel-admin-http';
import { prepareFileForScopedMediaUpload } from '../util/media-upload-prepare';

/**
 * Wire shape returned by both
 * `GET /api/v1/me/parent/children/{id}/documents` and
 * `GET /api/v1/children/{id}/documents` — the staff and parent
 * surfaces share a single response DTO so the same row component
 * can render either.
 *
 * `uploadedFromTenantId` + `uploadedFromTenantName` are populated for
 * staff uploads. Parent uploads (`uploaderRole === 'Parent'`) leave
 * them `null` so the SPA can render `{parentDisplayName} · Parent`
 * instead of an institution chip.
 */
export interface WayelChildDocument {
  id: string;
  parentChildId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  mediaUrl: string;
  title: string | null;
  notes: string | null;
  visibility: 'AllInstitutions' | 'SingleInstitution';
  uploaderRole: 'Parent' | 'Staff' | 'SuperAdmin';
  uploadedFromTenantId: string | null;
  uploadedFromTenantName: string | null;
  uploadedByUserId: string | null;
  uploadedByDisplayName: string;
  uploadedOnUtc: string;
  /**
   * Optional grouping code from the platform-wide
   * `DOCUMENT_CATEGORY` lookup (e.g. `MEDICAL`). `null` for
   * documents uploaded before the category dropdown shipped, or
   * when the uploader chose to leave the row uncategorised.
   */
  categoryCode: string | null;
  /** Denormalised display name for {@link categoryCode}. */
  categoryName: string | null;
  /**
   * Free-form, lower-cased tags attached at upload time. Drives
   * the SPA's chip filter strip and the per-row chip line below
   * the file name. Empty array for legacy rows.
   */
  tags: string[];
  /** Long-form notes the uploader set in the drawer's Description field. */
  description: string | null;
  /**
   * When `true`, the row should render with a lock affordance.
   * Downstream surfaces may use the flag to gate notifications;
   * the API currently treats it as a UI hint.
   */
  isConfidential: boolean;
}

interface ListResponse {
  items: WayelChildDocument[];
}

/** Wire body for the `/upload-ticket` POST. */
interface UploadTicketBody {
  contentType: string;
  fileName?: string | null;
  sizeBytes?: number | null;
}

interface UploadFinalizeBody {
  fileName: string;
  contentType: string;
  mediaUrl: string;
  sizeBytes?: number | null;
  title?: string | null;
  notes?: string | null;
  /**
   * Optional code from the `DOCUMENT_CATEGORY` lookup intent
   * (e.g. `MEDICAL`). Validated server-side; an unknown or
   * inactive code yields a 400.
   */
  categoryCode?: string | null;
  /** Free-form, lower-cased, deduped tags. Max 16, each ≤ 32 chars. */
  tags?: string[] | null;
  description?: string | null;
  isConfidential?: boolean | null;
}

interface ListTagsResponse {
  tags: string[];
}

const PARENT_BASE = '/api/v1/me/parent/children';
const STAFF_BASE = '/api/v1/children';

function withTenant(url: string, tenantId?: string | null): string {
  if (!tenantId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}tenantId=${encodeURIComponent(tenantId)}`;
}

/**
 * Frontend client for the child-document vault surface. Encapsulates
 * the parent vs staff routes so callers only think in terms of "I'm
 * the parent looking at my child" or "I'm staff at tenant X looking
 * at this institution-child".
 *
 * <para>
 * Upload is a two-hop: mint a presigned ticket on the dedicated
 * `/upload-ticket` route, `PUT` the bytes via the shared media
 * pipeline, then POST the metadata to the finalise route which
 * persists the {@link WayelChildDocument} catalog row. Splitting
 * those steps means the API server is never on the data path of
 * the binary itself — same shape as the existing daily-report
 * upload pipeline.
 * </para>
 */
@Injectable({ providedIn: 'root' })
export class WayelChildDocumentsService {
  private readonly media = inject(WayelAdminMediaService);

  // ── Parent surface ───────────────────────────────────────────────

  async listForParent(parentChildId: string): Promise<WayelChildDocument[]> {
    const res = await wayelAdminFetch<ListResponse>(
      `${PARENT_BASE}/${encodeURIComponent(parentChildId)}/documents`,
      { method: 'GET' },
    );
    return res?.items ?? [];
  }

  async uploadAsParent(
    parentChildId: string,
    file: File,
    options: {
      title?: string | null;
      notes?: string | null;
      categoryCode?: string | null;
      tags?: string[] | null;
      description?: string | null;
      isConfidential?: boolean | null;
    } = {},
  ): Promise<WayelChildDocument> {
    const prepared = await prepareFileForScopedMediaUpload(file, 'documents');

    const ticket = await this.parentTicket(parentChildId, {
      contentType: prepared.type || 'application/octet-stream',
      fileName: prepared.name,
      sizeBytes: prepared.size,
    });

    await this.putBytes(ticket, prepared);

    return wayelAdminFetch<WayelChildDocument>(
      `${PARENT_BASE}/${encodeURIComponent(parentChildId)}/documents`,
      {
        method: 'POST',
        body: JSON.stringify({
          fileName: prepared.name,
          contentType: prepared.type || 'application/octet-stream',
          mediaUrl: ticket.mediaUrl,
          sizeBytes: prepared.size,
          title: options.title ?? null,
          notes: options.notes ?? null,
          categoryCode: options.categoryCode ?? null,
          tags: options.tags ?? null,
          description: options.description ?? null,
          isConfidential: options.isConfidential ?? false,
        } satisfies UploadFinalizeBody),
      },
    );
  }

  async listTagsForParent(parentChildId: string): Promise<string[]> {
    const res = await wayelAdminFetch<ListTagsResponse>(
      `${PARENT_BASE}/${encodeURIComponent(parentChildId)}/documents/tags`,
      { method: 'GET' },
    );
    return res?.tags ?? [];
  }

  async deleteAsParent(parentChildId: string, documentId: string): Promise<void> {
    await wayelAdminFetch<void>(
      `${PARENT_BASE}/${encodeURIComponent(parentChildId)}/documents/${encodeURIComponent(documentId)}`,
      { method: 'DELETE' },
    );
  }

  private parentTicket(
    parentChildId: string,
    body: UploadTicketBody,
  ): Promise<WayelMediaUploadTicket> {
    return wayelAdminFetch<WayelMediaUploadTicket>(
      `${PARENT_BASE}/${encodeURIComponent(parentChildId)}/documents/upload-ticket`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  // ── Staff surface ────────────────────────────────────────────────

  async listForStaff(
    institutionChildId: string,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelChildDocument[]> {
    const res = await wayelAdminFetch<ListResponse>(
      withTenant(
        `${STAFF_BASE}/${encodeURIComponent(institutionChildId)}/documents`,
        options.tenantId,
      ),
      { method: 'GET' },
    );
    return res?.items ?? [];
  }

  async uploadAsStaff(
    institutionChildId: string,
    file: File,
    options: {
      tenantId?: string | null;
      title?: string | null;
      notes?: string | null;
      categoryCode?: string | null;
      tags?: string[] | null;
      description?: string | null;
      isConfidential?: boolean | null;
    } = {},
  ): Promise<WayelChildDocument> {
    const prepared = await prepareFileForScopedMediaUpload(file, 'documents');

    const ticket = await this.staffTicket(
      institutionChildId,
      {
        contentType: prepared.type || 'application/octet-stream',
        fileName: prepared.name,
        sizeBytes: prepared.size,
      },
      options.tenantId,
    );

    await this.putBytes(ticket, prepared);

    return wayelAdminFetch<WayelChildDocument>(
      withTenant(
        `${STAFF_BASE}/${encodeURIComponent(institutionChildId)}/documents`,
        options.tenantId,
      ),
      {
        method: 'POST',
        body: JSON.stringify({
          fileName: prepared.name,
          contentType: prepared.type || 'application/octet-stream',
          mediaUrl: ticket.mediaUrl,
          sizeBytes: prepared.size,
          title: options.title ?? null,
          notes: options.notes ?? null,
          categoryCode: options.categoryCode ?? null,
          tags: options.tags ?? null,
          description: options.description ?? null,
          isConfidential: options.isConfidential ?? false,
        } satisfies UploadFinalizeBody),
      },
    );
  }

  async listTagsForStaff(
    institutionChildId: string,
    options: { tenantId?: string | null } = {},
  ): Promise<string[]> {
    const res = await wayelAdminFetch<ListTagsResponse>(
      withTenant(
        `${STAFF_BASE}/${encodeURIComponent(institutionChildId)}/documents/tags`,
        options.tenantId,
      ),
      { method: 'GET' },
    );
    return res?.tags ?? [];
  }

  async deleteAsStaff(
    institutionChildId: string,
    documentId: string,
    options: { tenantId?: string | null } = {},
  ): Promise<void> {
    await wayelAdminFetch<void>(
      withTenant(
        `${STAFF_BASE}/${encodeURIComponent(institutionChildId)}/documents/${encodeURIComponent(documentId)}`,
        options.tenantId,
      ),
      { method: 'DELETE' },
    );
  }

  private staffTicket(
    institutionChildId: string,
    body: UploadTicketBody,
    tenantId?: string | null,
  ): Promise<WayelMediaUploadTicket> {
    return wayelAdminFetch<WayelMediaUploadTicket>(
      withTenant(
        `${STAFF_BASE}/${encodeURIComponent(institutionChildId)}/documents/upload-ticket`,
        tenantId,
      ),
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  // ── Shared upload helper ─────────────────────────────────────────

  /**
   * Push the prepared bytes at the presigned URL. We mirror the
   * cookie / XSRF wiring `WayelAdminMediaService.uploadFile`
   * implements (the dev BFF protects the local PUT route with the
   * same antiforgery middleware that guards the JSON surface). For
   * production S3 targets the PUT is cross-origin and the cookie /
   * header are simply not sent.
   */
  private async putBytes(
    ticket: WayelMediaUploadTicket,
    prepared: File,
  ): Promise<void> {
    const xsrf = readXsrfCookie();
    const headers: Record<string, string> = { ...ticket.headers };
    if (xsrf) {
      headers['X-XSRF-TOKEN'] = xsrf;
    }
    const isSameOrigin = isSameOriginUrl(ticket.uploadUrl);
    const res = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      body: prepared,
      credentials: isSameOrigin ? 'include' : 'omit',
      headers,
    });

    if (!res.ok) {
      throw new Error(
        `Upload failed (${res.status}). The file was not stored — please try again.`,
      );
    }
  }
}

function readXsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('XSRF-TOKEN='));
  if (!match) return null;
  return decodeURIComponent(match.slice('XSRF-TOKEN='.length));
}

function isSameOriginUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const target = new URL(url, window.location.origin);
    return target.origin === window.location.origin;
  } catch {
    return false;
  }
}
