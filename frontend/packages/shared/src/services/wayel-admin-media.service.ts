import { Injectable } from '@angular/core';
import { prepareFileForScopedMediaUpload } from '../util/media-upload-prepare';
import { wayelAdminFetch } from './wayel-admin-http';

/**
 * Frontend client for the S3-style media pipeline.
 *
 * Two layers live in this one service:
 *
 *   1. **Upload primitives** — mirror the backend's three-step ticket
 *      flow on `/api/v1/media/upload-tickets` and the dev `PUT` route.
 *      Aggregates that already store media inline (DailyReport, Memory)
 *      use `uploadFile` and persist the returned `mediaUrl` on their
 *      own DTO.
 *   2. **Catalog helpers** — wrap the
 *      `MediaAsset` aggregate endpoints on `/api/v1/media/assets`.
 *      Anything without a natural host aggregate (child documents,
 *      parent vault uploads, tenant branding artwork) registers a
 *      catalog row via `registerAsset` so it can be listed and
 *      soft-deleted later.
 *
 * `uploadAndAttach` chains the two layers — for the common case of
 * "user picks a file in the documents tab" it's the only method the
 * caller needs.
 *
 * The class still carries the historical `Admin` prefix but is portal-
 * agnostic — both the admin portal and the external client (parent /
 * staff) use it via the shared `/api/v1/...` BFF route.
 */
export interface WayelCreateMediaUploadTicketBody {
  contentType: string;
  fileName?: string | null;
  scope?: string | null;
  ttlSeconds?: number | null;
  /**
   * Optional client-supplied size in bytes. The endpoint pre-validates
   * against the per-scope limit before minting a ticket, so passing
   * this saves a wasted PUT on oversized files.
   */
  sizeBytes?: number | null;
  /**
   * Optional owner discriminator. When supplied (`ownerType` +
   * `ownerId` together), the API nests the S3 key as
   * `{tenantId}/{scope}/{ownerType}/{ownerId}/{guid}.{ext}` so per-
   * owner S3 lifecycle rules + per-owner IAM become possible. Both
   * fields must be set together or both omitted; the API rejects
   * half-stamped requests with HTTP 400.
   *
   * Pass these whenever the SPA already knows which entity the file
   * belongs to (a child, a parent, a user, the tenant). Leaving them
   * out is fine for legacy / tenant-scoped uploads but loses the
   * per-owner storage prefix.
   */
  ownerType?: WayelMediaAssetOwnerType | null;
  ownerId?: string | null;
}

export interface WayelMediaUploadTicket {
  mediaId: string;
  uploadUrl: string;
  mediaUrl: string;
  headers: Record<string, string>;
  expiresAtUtc: string;
}

export interface UploadResult {
  mediaId: string;
  mediaUrl: string;
}

/** Bytes actually sent after optional image normalisation for scoped uploads. */
export type UploadPreparedResult = UploadResult & { uploadedFile: File };

/**
 * Mirrors the backend `MediaAssetOwnerType` enum (string-cased on the
 * wire). `User` covers individual user accounts (e.g. staff personal
 * documents) — distinct from `Parent`, which targets the parent
 * aggregate id specifically.
 */
export type WayelMediaAssetOwnerType = 'Tenant' | 'Child' | 'Parent' | 'User';

/** Mirrors the backend `MediaKind` enum. */
export type WayelMediaKind = 'Image' | 'Video' | 'Document' | 'Audio';

export interface WayelMediaAssetOwner {
  ownerType: WayelMediaAssetOwnerType;
  ownerId: string;
}

export interface WayelRegisterMediaAssetBody extends WayelMediaAssetOwner {
  scope: string;
  contentType: string;
  mediaUrl: string;
  fileName?: string | null;
  sizeBytes?: number | null;
  title?: string | null;
}

export interface WayelMediaAsset {
  id: string;
  tenantId: string;
  ownerType: WayelMediaAssetOwnerType;
  ownerId: string;
  scope: string;
  kind: WayelMediaKind;
  contentType: string;
  mediaUrl: string;
  fileName: string | null;
  sizeBytes: number | null;
  title: string | null;
  uploadedByUserId: string | null;
  uploadedOnUtc: string;
  deletedOnUtc: string | null;
}

export interface WayelListMediaAssetsQuery extends WayelMediaAssetOwner {
  kind?: WayelMediaKind | null;
  scope?: string | null;
  includeDeleted?: boolean;
}

const base = '/api/v1/media';

function queryWithTenant(tenantId?: string | null): string {
  if (!tenantId) return '';
  const params = new URLSearchParams();
  params.set('tenantId', tenantId);
  return `?${params.toString()}`;
}

@Injectable({ providedIn: 'root' })
export class WayelAdminMediaService {
  /**
   * Mint a presigned upload ticket. The optional `tenantId` is sent as
   * `?tenantId=` for the SuperAdmin override; everyone else implicitly
   * gets a ticket for their own tenant.
   */
  createTicket(
    body: WayelCreateMediaUploadTicketBody,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelMediaUploadTicket> {
    return wayelAdminFetch<WayelMediaUploadTicket>(
      `${base}/upload-tickets${queryWithTenant(options.tenantId)}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * Mint a ticket, `PUT` prepared bytes, return stable read URL. Raster
   * images for `daily-reports` / `memories` / `documents` are re-encoded
   * client-side toward a 10&nbsp;MB JPEG ceiling; raw inputs are capped
   * at 100&nbsp;MB so HD video can pass through.
   */
  async uploadFile(
    file: File,
    options: {
      tenantId?: string | null;
      scope?: string;
      /**
       * When supplied, the S3 key gets a `/{ownerType}/{ownerId}/`
       * segment after the scope. Strongly recommended whenever the
       * caller already knows which entity the file belongs to so the
       * bucket layout matches the catalog row layout.
       */
      owner?: WayelMediaAssetOwner | null;
    } = {},
  ): Promise<UploadPreparedResult> {
    const scope = options.scope ?? 'daily-reports';
    const prepared = await prepareFileForScopedMediaUpload(file, scope);

    const ticket = await this.createTicket(
      {
        contentType: prepared.type || 'application/octet-stream',
        fileName: prepared.name,
        scope,
        sizeBytes: prepared.size,
        ownerType: options.owner?.ownerType ?? null,
        ownerId: options.owner?.ownerId ?? null,
      },
      { tenantId: options.tenantId },
    );

    // The upload itself bypasses `wayelAdminFetch` because:
    //   - the body is binary, not JSON;
    //   - the URL may be cross-origin in production (S3) and we don't
    //     want our default `Accept: application/json` muddying signed
    //     headers.
    //
    // For the dev / BFF path the upload URL points at our own
    // `/api/v1/media/upload/{token}` which the BFF's antiforgery
    // middleware guards. We forward cookies (so the `XSRF-TOKEN` cookie
    // is on the wire) and echo it as the `X-XSRF-TOKEN` header just
    // like Angular's `HttpClientXsrfModule` would for the JSON path.
    // The S3 case in production is unaffected — it's cross-origin and
    // the cookie + header aren't sent.
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

    return {
      mediaId: ticket.mediaId,
      mediaUrl: ticket.mediaUrl,
      uploadedFile: prepared,
    };
  }

  // ── Catalog (MediaAsset aggregate) ─────────────────────────────────

  /**
   * Register an uploaded file as a catalog row. Call this after
   * {@link uploadFile} succeeds so the asset shows up in the owner's
   * documents list and survives a soft-delete trail.
   */
  registerAsset(
    body: WayelRegisterMediaAssetBody,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelMediaAsset> {
    return wayelAdminFetch<WayelMediaAsset>(
      `${base}/assets${queryWithTenant(options.tenantId)}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * List the catalog rows owned by `(ownerType, ownerId)` inside the
   * caller's tenant. Soft-deleted rows are excluded by default — flip
   * `includeDeleted` to true to surface a "Recently deleted" affordance.
   */
  listAssets(
    query: WayelListMediaAssetsQuery,
    options: { tenantId?: string | null } = {},
  ): Promise<WayelMediaAsset[]> {
    const params = new URLSearchParams();
    params.set('ownerType', query.ownerType);
    params.set('ownerId', query.ownerId);
    if (query.kind) params.set('kind', query.kind);
    if (query.scope) params.set('scope', query.scope);
    if (query.includeDeleted) params.set('includeDeleted', 'true');
    if (options.tenantId) params.set('tenantId', options.tenantId);

    const qs = params.toString();
    return wayelAdminFetch<WayelMediaAsset[]>(
      `${base}/assets${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
    );
  }

  /**
   * Soft-delete a catalog row. The underlying blob is left in place
   * (lifecycle / retention rules clean it up); the row keeps a
   * `deletedOnUtc` stamp so audit + recovery flows work.
   */
  removeAsset(
    id: string,
    options: { tenantId?: string | null } = {},
  ): Promise<void> {
    return wayelAdminFetch<void>(
      `${base}/assets/${encodeURIComponent(id)}${queryWithTenant(options.tenantId)}`,
      { method: 'DELETE' },
    );
  }

  /**
   * One-shot helper for the documents/uploads UI: mint a ticket, push
   * the bytes, and create the catalog row in a single call. Returns
   * the persisted catalog row so the caller can prepend it to its
   * local list signal without an extra round-trip.
   *
   * Failure modes:
   *
   *  - If the upload PUT fails, no catalog row is created.
   *  - If the catalog `POST` fails, the bytes have already been
   *    persisted but no row references them. The lifecycle sweep
   *    (operator-side, not in scope here) is responsible for cleaning
   *    up orphaned blobs older than its grace window.
   */
  async uploadAndAttach(
    file: File,
    owner: WayelMediaAssetOwner,
    options: {
      tenantId?: string | null;
      scope?: string;
      title?: string | null;
    } = {},
  ): Promise<WayelMediaAsset> {
    const scope = options.scope ?? 'documents';
    // Propagate the same owner to the upload step so the S3 object
    // key gains the `/{ownerType}/{ownerId}/` prefix that matches the
    // catalog row we'll register a moment later. Without this the
    // bytes would land in the legacy flat layout while the catalog
    // row pointed to an owner — a subtle inconsistency operators
    // would have to reconcile manually.
    const upload = await this.uploadFile(file, {
      tenantId: options.tenantId,
      scope,
      owner,
    });

    return this.registerAsset(
      {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        scope,
        contentType: upload.uploadedFile.type || 'application/octet-stream',
        mediaUrl: upload.mediaUrl,
        fileName: upload.uploadedFile.name,
        sizeBytes: upload.uploadedFile.size,
        title: options.title ?? null,
      },
      { tenantId: options.tenantId },
    );
  }
}

/**
 * Read the BFF's `XSRF-TOKEN` cookie if present. Returns `null` outside
 * a browser or when the cookie isn't there yet (e.g. before the SPA's
 * first authenticated GET seeds it). The middleware only enforces the
 * header when the cookie is set, so a `null` here is safe.
 */
function readXsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('XSRF-TOKEN='));
  if (!match) return null;
  return decodeURIComponent(match.slice('XSRF-TOKEN='.length));
}

/**
 * Treat protocol-relative + same-origin URLs as "same origin" so we
 * forward the session cookie. Anything cross-origin (S3, R2, etc.)
 * is left alone — those targets authenticate through the signature in
 * the URL, not via cookies.
 */
function isSameOriginUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const target = new URL(url, window.location.origin);
    return target.origin === window.location.origin;
  } catch {
    return false;
  }
}
