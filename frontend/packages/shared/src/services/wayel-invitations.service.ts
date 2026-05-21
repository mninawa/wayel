import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from '@wayel/shared/services/bff-auth.service';
import { platformBearerAuthHeaders } from '@wayel/shared/services/wayel-admin-http';

/**
 * Minimal HTTP client for the new Wayel.Api staff-invitation surface
 * (`/api/v1/staff-invitations/...`), proxied through the admin BFF.
 *
 * Why hand-rolled `fetch` instead of `HttpClient`?
 *
 *   - The shared `httpErrorInterceptor` redirects on every 401 → /login. The
 *     invitations screen needs to surface 401/403 inline (e.g. "you're not a
 *     tenant admin") rather than bouncing the user out, so we keep it off
 *     the interceptor pipeline.
 *   - The BFF cookie is HttpOnly + same-origin; `credentials: 'include'`
 *     in `fetch` is the smallest amount of plumbing that lets us stay on
 *     the cookie session without touching `bff-auth.bootstrap.ts`.
 *
 * Responses come back from `Wayel.Api` as camelCased JSON (the default
 * `JsonSerializerOptions(JsonSerializerDefaults.Web)`), and enums are
 * serialized as PascalCase strings via `JsonStringEnumConverter`.
 */
export interface WayelInvitation {
  id: string;
  email: string;
  role: string;
  channel: 'Email' | 'WhatsApp' | 'Both';
  phone: string | null;
  status: 'Pending' | 'Accepted' | 'Revoked' | 'Expired';
  createdOnUtc: string;
  expiresOnUtc: string;
  acceptedOnUtc: string | null;
  revokedOnUtc: string | null;
  resendCount: number;
}

export interface WayelCreateInvitationRequest {
  email: string;
  role: string;
  channel: 'Email' | 'WhatsApp' | 'Both';
  phone?: string | null;
  message?: string | null;
}

export interface WayelCreateInvitationResponse {
  invitationId: string;
  email: string;
  role: string;
  channel: 'Email' | 'WhatsApp' | 'Both';
  expiresOnUtc: string;
  /** Plaintext invitation token. Returned exactly once on creation. */
  token: string;
  /**
   * Server-composed accept URL — the same string baked into the email/SMS
   * the recipient just received. Null when no `NotificationOptions.AcceptUrlBase`
   * is configured for the role; callers fall back to the SPA-side
   * `buildInvitationAcceptUrl(token)` helper, which uses `window.origin`.
   */
  acceptUrl: string | null;
}

export interface WayelResendInvitationResponse {
  token: string;
  expiresOnUtc: string;
  acceptUrl: string | null;
}

export interface WayelInvitationsHttpError extends Error {
  status: number;
  /** Wayel error code (e.g. `invitation.email_invalid`) when present. */
  code?: string;
}

const BASE = '/api/v1/staff-invitations';

@Injectable({ providedIn: 'root' })
export class WayelInvitationsService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  list(status?: WayelInvitation['status']): Promise<WayelInvitation[]> {
    const url = status ? `${BASE}?status=${encodeURIComponent(status)}` : BASE;
    return this.request<WayelInvitation[]>(url, { method: 'GET' });
  }

  create(body: WayelCreateInvitationRequest): Promise<WayelCreateInvitationResponse> {
    return this.request<WayelCreateInvitationResponse>(BASE, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  resend(id: string): Promise<WayelResendInvitationResponse> {
    return this.request<WayelResendInvitationResponse>(
      `${BASE}/${encodeURIComponent(id)}/resend`,
      { method: 'POST' },
    );
  }

  revoke(id: string): Promise<void> {
    return this.request<void>(
      `${BASE}/${encodeURIComponent(id)}/revoke`,
      { method: 'POST' },
    );
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    // For state-changing methods (POST/PUT/PATCH/DELETE) attach the
    // BFF-issued antiforgery header. The shared helper reads the
    // non-HttpOnly XSRF-TOKEN cookie that the BFF sets on safe-method
    // responses (see BffAntiforgeryMiddleware in Wayel.Bff.Shared).
    const isStateChanging = init.method !== undefined &&
      init.method !== 'GET' && init.method !== 'HEAD' && init.method !== 'OPTIONS';

    const response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        ...this.baseHeaders,
        ...platformBearerAuthHeaders(),
        ...(isStateChanging ? bffStateChangingHeaders() : {}),
        ...(init.headers ?? {}),
      },
    });

    if (response.ok) {
      if (response.status === 204) {
        return undefined as T;
      }
      const text = await response.text();
      return text ? (JSON.parse(text) as T) : (undefined as T);
    }

    // Try to surface the API's ProblemDetails payload — the Wayel API uses
    // `Error.Code` (e.g. `invitation.email_invalid`) and a human `title`.
    let code: string | undefined;
    let detail = `Request failed with HTTP ${response.status}.`;
    try {
      const payload = (await response.json()) as {
        title?: string;
        detail?: string;
        type?: string;
        code?: string;
        errors?: Record<string, string[]>;
      };
      detail = payload.detail || payload.title || detail;
      code = payload.code ?? payload.type ?? undefined;
    } catch {
      // Body wasn't JSON — fall back to the default message.
    }

    const err = new Error(detail) as WayelInvitationsHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

/** Convenience accessor for components that prefer `inject()` ergonomics. */
export const useWayelInvitations = (): WayelInvitationsService =>
  inject(WayelInvitationsService);
