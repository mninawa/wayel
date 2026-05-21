import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';

/**
 * HTTP client for the parent payment-methods (saved-card) surface,
 * mirroring `Wayel.Api.Endpoints.MePaymentMethodsEndpoints`. Routes:
 *
 * - `POST   /api/v1/me/payment-methods/initiate` — start a hosted-checkout
 *   verify flow. Returns `{ reference, authorizationUrl, accessCode }`;
 *   the SPA redirects `window.location` to `authorizationUrl` so the
 *   user does 3DS on the provider's domain (Paystack today, but the
 *   port is provider-agnostic — we never touch raw card data).
 * - `POST   /api/v1/me/payment-methods/confirm` — server-to-server
 *   verify against the provider, persist the tokenised authorization,
 *   and refund the verify charge. The SPA's "card-added" landing page
 *   reads `?reference=…` from the redirect query string and posts
 *   here. Idempotent for duplicate references.
 * - `GET    /api/v1/me/payment-methods` — list saved cards, default
 *   first.
 * - `POST   /api/v1/me/payment-methods/{id}/default` — flip the
 *   default flag atomically.
 * - `DELETE /api/v1/me/payment-methods/{id}` — soft-revoke (renewal
 *   ticker stops charging it).
 *
 * Errors throw a {@link PaymentMethodsHttpError} carrying the Wayel
 * error code (e.g. `payment_method.verify_declined`, `payment_method.
 * not_found`, `payment_gateway.misconfigured`) so the SPA can render
 * targeted UX rather than a generic banner.
 */

export type PaymentMethodStatus = 'Active' | 'Revoked' | 'Expired';

export interface PaymentMethodSummary {
  paymentMethodId: string;
  providerName: string;
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  status: PaymentMethodStatus;
  createdOnUtc: string;
  updatedOnUtc: string;
}

export interface InitiateAddPaymentMethodResponse {
  reference: string;
  authorizationUrl: string;
  accessCode: string;
}

export interface PaymentMethodsHttpError extends Error {
  status: number;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentMethodsApiService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  /**
   * Start an add-card flow. The SPA passes the URL the provider
   * should redirect back to (typically `/parent/profile/payment-methods/added`);
   * the API resolves a default if the SPA omits it.
   */
  async initiate(callbackUrl: string): Promise<InitiateAddPaymentMethodResponse> {
    return this.request<InitiateAddPaymentMethodResponse>(
      '/api/v1/me/payment-methods/initiate',
      {
        method: 'POST',
        body: JSON.stringify({ callbackUrl }),
      },
    );
  }

  /**
   * Confirm an add-card session. The reference is the value the
   * provider tacks onto the redirect URL as `?reference=…`. Calling
   * this twice with the same reference returns the existing saved
   * card (the API short-circuits before insert).
   */
  async confirm(reference: string): Promise<PaymentMethodSummary> {
    return this.request<PaymentMethodSummary>(
      '/api/v1/me/payment-methods/confirm',
      {
        method: 'POST',
        body: JSON.stringify({ reference }),
      },
    );
  }

  async list(): Promise<PaymentMethodSummary[]> {
    return this.request<PaymentMethodSummary[]>(
      '/api/v1/me/payment-methods',
      { method: 'GET' },
    );
  }

  async setDefault(paymentMethodId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/me/payment-methods/${encodeURIComponent(paymentMethodId)}/default`,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async revoke(paymentMethodId: string): Promise<void> {
    await this.request<void>(
      `/api/v1/me/payment-methods/${encodeURIComponent(paymentMethodId)}`,
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
        code =
          idx >= 0 ? payload.type.substring(idx + marker.length) : payload.type;
      }
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as PaymentMethodsHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const usePaymentMethods = (): PaymentMethodsApiService =>
  inject(PaymentMethodsApiService);
