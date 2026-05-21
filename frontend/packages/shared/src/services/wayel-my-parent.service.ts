import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';

/**
 * HTTP client for the parent self-service surface (`/api/v1/me/parent/...`),
 * proxied through whichever BFF the SPA is hosted under (the BFFs all
 * forward `/api/{**catch-all}` to the upstream API).
 *
 * Mirrors `Wayel.Api.Endpoints.MeParentEndpoints` 1:1. Every call is
 * implicitly scoped to the authenticated parent — there is no caller-
 * supplied parent id and no admin override. Errors surface as
 * `WayelMyParentHttpError` carrying the Wayel error code (e.g.
 * `parent.child_name_duplicate`) so callers can render targeted UX
 * instead of bouncing through the global error interceptor.
 */
export type WayelChildGender = 'undisclosed' | 'male' | 'female' | 'other';

export interface WayelChildProfile {
  firstName: string | null;
  lastName: string | null;
  gender: WayelChildGender;
  hasEpilepsyHistory: boolean | null;
  allowSocialMediaSharing: boolean | null;
  ailmentsAllergiesConditions: string | null;
}

/**
 * Snapshot of which platform-required documents (clinic card +
 * birth certificate) are currently attached to the child's vault.
 *
 * The wire shape is `null` for legacy clients that pre-date the
 * field — UIs MUST treat that as "unknown" and fall back to the
 * server-side guard rather than silently letting the parent submit
 * a subscription request that will be rejected anyway.
 */
export interface WayelRequiredChildDocumentsStatus {
  hasClinicCard: boolean;
  hasBirthCertificate: boolean;
  /** True iff both required documents are present. */
  hasAll: boolean;
}

export interface WayelParentChild {
  parentChildId: string;
  displayName: string;
  /** ISO 8601 calendar date — `YYYY-MM-DD`. */
  dateOfBirth: string;
  notes: string | null;
  photoUrl: string | null;
  profile: WayelChildProfile;
  createdOnUtc: string;
  updatedOnUtc: string;
  /**
   * Server-resolved snapshot of "does this child carry both required
   * documents?". `null` when the API hasn't computed it (older
   * deploys) or when the server returns a mocked summary that never
   * touches the document store.
   */
  requiredDocuments: WayelRequiredChildDocumentsStatus | null;
}

export interface WayelMyParent {
  parentId: string;
  ownerUserId: string;
  displayName: string;
  email: string;
  phone: string | null;
  children: WayelParentChild[];
  createdOnUtc: string;
  updatedOnUtc: string;
}

export interface WayelUpdateMyParentProfileRequest {
  displayName?: string | null;
  phone?: string | null;
  clearPhone?: boolean;
}

/**
 * One of the two required document uploads attached to an
 * <see cref="WayelAddChildRequest"/>. The bytes are already in object
 * storage — the SPA hits
 * `POST /api/v1/me/parent/pending-child-documents/upload-ticket`
 * first, PUTs the file to the presigned URL, then echoes the
 * catalog metadata here so `AddChildCommand` can stitch the asset
 * onto the new ParentChild aggregate.
 */
export interface WayelRequiredChildDocumentUpload {
  fileName: string;
  contentType: string;
  sizeBytes?: number | null;
  /** Stable read URL returned by the upload-ticket call. */
  mediaUrl: string;
}

export interface WayelAddChildRequest {
  displayName: string;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string;
  notes?: string | null;
  photoUrl?: string | null;
  profile?: WayelChildProfile | null;
  /** Required clinic card upload (must already be in object storage). */
  clinicCard: WayelRequiredChildDocumentUpload;
  /** Required birth certificate upload (must already be in object storage). */
  birthCertificate: WayelRequiredChildDocumentUpload;
}

/**
 * Wire shape of the upload-ticket endpoint response. Mirrors
 * `ParentChildDocumentUploadTicketResponse` on the API side. The
 * `headers` map carries any signed headers the SPA must include
 * with the PUT.
 */
export interface WayelUploadTicket {
  mediaId: string;
  uploadUrl: string;
  mediaUrl: string;
  headers: Record<string, string>;
  expiresAtUtc: string;
}

/**
 * The PATCH endpoint distinguishes "leave field alone" (omit) from
 * "explicitly set to null" via paired `clearXxx: true` flags.
 */
export interface WayelUpdateChildRequest {
  displayName?: string | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth?: string | null;
  notes?: string | null;
  clearNotes?: boolean;
  photoUrl?: string | null;
  clearPhoto?: boolean;
  profile?: WayelChildProfile | null;
}

export interface WayelMyParentHttpError extends Error {
  status: number;
  /** Wayel error code, e.g. `parent.child_name_duplicate`. */
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class WayelMyParentService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async get(): Promise<WayelMyParent> {
    const wire = await this.request<WireMyParent>('/api/v1/me/parent', {
      method: 'GET',
    });
    return fromWireParent(wire);
  }

  async updateProfile(
    body: WayelUpdateMyParentProfileRequest,
  ): Promise<WayelMyParent> {
    const wire = await this.request<WireMyParent>('/api/v1/me/parent', {
      method: 'PATCH',
      body: JSON.stringify({
        displayName: body.displayName ?? null,
        phone: body.phone ?? null,
        clearPhone: body.clearPhone ?? false,
      }),
    });
    return fromWireParent(wire);
  }

  async addChild(body: WayelAddChildRequest): Promise<WayelParentChild> {
    const wire = await this.request<WireParentChild>(
      '/api/v1/me/parent/children',
      {
        method: 'POST',
        body: JSON.stringify(toAddChildWire(body)),
      },
    );
    return fromWireChild(wire);
  }

  /**
   * Mints a presigned upload URL for one of the two required
   * documents attached to an in-progress add-child flow. The
   * resulting `mediaUrl` is fed back into
   * <see cref="WayelAddChildRequest.clinicCard"/> /
   * <see cref="WayelAddChildRequest.birthCertificate"/> after the
   * SPA PUTs the bytes.
   */
  async createPendingChildDocumentUploadTicket(input: {
    contentType: string;
    fileName?: string | null;
    sizeBytes?: number | null;
  }): Promise<WayelUploadTicket> {
    return this.request<WayelUploadTicket>(
      '/api/v1/me/parent/pending-child-documents/upload-ticket',
      {
        method: 'POST',
        body: JSON.stringify({
          contentType: input.contentType,
          fileName: input.fileName ?? null,
          sizeBytes: input.sizeBytes ?? null,
        }),
      },
    );
  }

  /**
   * Convenience helper that wraps the three-step "ticket → PUT →
   * metadata" pattern: mint a pending upload ticket, push the bytes
   * to the presigned URL, then return the metadata block ready to
   * fold into <see cref="WayelAddChildRequest"/>. Using the helper
   * keeps the upload sequence consistent across the add-child
   * drawer and any future onboarding wizards.
   */
  async uploadRequiredChildDocument(
    file: File,
  ): Promise<WayelRequiredChildDocumentUpload> {
    const ticket = await this.createPendingChildDocumentUploadTicket({
      contentType: file.type || 'application/octet-stream',
      fileName: file.name,
      sizeBytes: file.size,
    });

    const headers: Record<string, string> = { ...(ticket.headers ?? {}) };
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = file.type || 'application/octet-stream';
    }

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers,
      body: file,
    });
    if (!put.ok) {
      const err = new Error(
        `Required document upload failed (HTTP ${put.status}).`,
      ) as WayelMyParentHttpError;
      err.status = put.status;
      err.code = 'media.upload_failed';
      throw err;
    }

    return {
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      mediaUrl: ticket.mediaUrl,
    };
  }

  async updateChild(
    childId: string,
    body: WayelUpdateChildRequest,
  ): Promise<WayelParentChild> {
    const wire = await this.request<WireParentChild>(
      `/api/v1/me/parent/children/${encodeURIComponent(childId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(toUpdateChildWire(body)),
      },
    );
    return fromWireChild(wire);
  }

  async removeChild(childId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/me/parent/children/${encodeURIComponent(childId)}`,
      { method: 'DELETE' },
    );
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const isStateChanging =
      init.method !== undefined &&
      init.method !== 'GET' &&
      init.method !== 'HEAD' &&
      init.method !== 'OPTIONS';

    const response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...this.baseHeaders,
        ...(isStateChanging ? bffStateChangingHeaders() : {}),
        ...(init.headers ?? {}),
      },
    });

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return text ? (JSON.parse(text) as T) : (undefined as T);
    }

    let detail = `Request failed with HTTP ${response.status}.`;
    let code: string | undefined;
    try {
      const payload = (await response.json()) as {
        title?: string;
        detail?: string;
        type?: string;
        code?: string;
        error?: string;
      };
      detail = payload.detail || payload.title || detail;
      if (payload.code) {
        code = payload.code;
      } else if (payload.error) {
        code = payload.error;
      } else if (payload.title && payload.title.includes('.')) {
        code = payload.title;
      } else if (payload.type) {
        const marker = '/errors/';
        const idx = payload.type.indexOf(marker);
        code = idx >= 0 ? payload.type.substring(idx + marker.length) : payload.type;
      }
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as WayelMyParentHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useWayelMyParent = (): WayelMyParentService =>
  inject(WayelMyParentService);

/* ────────────────────────────────────────────────────────────────────────── */
/* Wire <-> domain mapping                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

interface WireChildProfile {
  firstName: string | null;
  lastName: string | null;
  gender: 'Undisclosed' | 'Male' | 'Female' | 'Other';
  hasEpilepsyHistory: boolean | null;
  allowSocialMediaSharing: boolean | null;
  ailmentsAllergiesConditions: string | null;
}

interface WireRequiredChildDocumentsStatus {
  hasClinicCard: boolean;
  hasBirthCertificate: boolean;
  hasAll?: boolean;
}

interface WireParentChild {
  parentChildId: string;
  displayName: string;
  dateOfBirth: string;
  notes: string | null;
  photoUrl: string | null;
  profile: WireChildProfile;
  createdOnUtc: string;
  updatedOnUtc: string;
  requiredDocuments?: WireRequiredChildDocumentsStatus | null;
}

interface WireMyParent {
  parentId: string;
  ownerUserId: string;
  displayName: string;
  email: string;
  phone: string | null;
  children: WireParentChild[];
  createdOnUtc: string;
  updatedOnUtc: string;
}

function fromWireGender(g: WireChildProfile['gender']): WayelChildGender {
  switch (g) {
    case 'Male':
      return 'male';
    case 'Female':
      return 'female';
    case 'Other':
      return 'other';
    default:
      return 'undisclosed';
  }
}

function toWireGender(g: WayelChildGender): WireChildProfile['gender'] {
  switch (g) {
    case 'male':
      return 'Male';
    case 'female':
      return 'Female';
    case 'other':
      return 'Other';
    default:
      return 'Undisclosed';
  }
}

function fromWireProfile(p: WireChildProfile): WayelChildProfile {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    gender: fromWireGender(p.gender),
    hasEpilepsyHistory: p.hasEpilepsyHistory,
    allowSocialMediaSharing: p.allowSocialMediaSharing,
    ailmentsAllergiesConditions: p.ailmentsAllergiesConditions,
  };
}

function toWireProfile(p: WayelChildProfile): WireChildProfile {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    gender: toWireGender(p.gender),
    hasEpilepsyHistory: p.hasEpilepsyHistory,
    allowSocialMediaSharing: p.allowSocialMediaSharing,
    ailmentsAllergiesConditions: p.ailmentsAllergiesConditions,
  };
}

function fromWireChild(w: WireParentChild): WayelParentChild {
  return {
    parentChildId: w.parentChildId,
    displayName: w.displayName,
    dateOfBirth: w.dateOfBirth,
    notes: w.notes,
    photoUrl: w.photoUrl,
    profile: fromWireProfile(w.profile),
    createdOnUtc: w.createdOnUtc,
    updatedOnUtc: w.updatedOnUtc,
    requiredDocuments: fromWireRequiredDocuments(w.requiredDocuments ?? null),
  };
}

function fromWireRequiredDocuments(
  w: WireRequiredChildDocumentsStatus | null,
): WayelRequiredChildDocumentsStatus | null {
  if (!w) return null;
  const hasClinicCard = !!w.hasClinicCard;
  const hasBirthCertificate = !!w.hasBirthCertificate;
  return {
    hasClinicCard,
    hasBirthCertificate,
    hasAll: hasClinicCard && hasBirthCertificate,
  };
}

function fromWireParent(w: WireMyParent): WayelMyParent {
  return {
    parentId: w.parentId,
    ownerUserId: w.ownerUserId,
    displayName: w.displayName,
    email: w.email,
    phone: w.phone,
    children: w.children.map(fromWireChild),
    createdOnUtc: w.createdOnUtc,
    updatedOnUtc: w.updatedOnUtc,
  };
}

function toAddChildWire(body: WayelAddChildRequest): unknown {
  return {
    displayName: body.displayName,
    dateOfBirth: body.dateOfBirth,
    notes: body.notes ?? null,
    photoUrl: body.photoUrl ?? null,
    profile: body.profile ? toWireProfile(body.profile) : null,
    clinicCard: toWireRequiredDocumentUpload(body.clinicCard),
    birthCertificate: toWireRequiredDocumentUpload(body.birthCertificate),
  };
}

function toWireRequiredDocumentUpload(u: WayelRequiredChildDocumentUpload) {
  return {
    fileName: u.fileName,
    contentType: u.contentType,
    sizeBytes: u.sizeBytes ?? null,
    mediaUrl: u.mediaUrl,
  };
}

function toUpdateChildWire(body: WayelUpdateChildRequest): unknown {
  return {
    displayName: body.displayName ?? null,
    dateOfBirth: body.dateOfBirth ?? null,
    notes: body.notes ?? null,
    clearNotes: body.clearNotes ?? false,
    photoUrl: body.photoUrl ?? null,
    clearPhoto: body.clearPhoto ?? false,
    profile: body.profile ? toWireProfile(body.profile) : null,
  };
}
