import { Injectable, inject } from '@angular/core';

/**
 * HTTP client for the institution-side invoice listing surface,
 * mirroring `Wayel.Api.Endpoints.BillingPayoutEndpoints` (TenantAdmin
 * or above):
 *
 * - `GET /api/v1/billing/institutions/{tenantId}/invoices?page=&pageSize=&status=`
 *   — every Layer-B invoice (parent → tenant) generated against a
 *   subscription period that belongs to the institution. Newest-first.
 *
 * The response is a flat row-per-invoice shape — server-side joins
 * already resolved parent display name, programme name, classroom and
 * cadence, so the SPA just renders a table without follow-up calls.
 *
 * Errors throw a {@link InstitutionInvoicesHttpError} so the SPA can
 * render targeted UX (`status` carries the HTTP code, `code` the Wayel
 * error code when the API surfaces one).
 */

export type TenantInvoiceStatus =
  | 'Draft'
  | 'Issued'
  | 'Paid'
  | 'PartiallyRefunded'
  | 'Refunded'
  | 'Voided'
  | 'PastDue'
  | 'Proforma';

export interface TenantInvoiceItem {
  invoiceId: string;
  number: string;
  status: TenantInvoiceStatus;
  totalCents: number;
  currency: string;
  formattedTotal: string;
  issuedOnUtc: string;
  dueOnUtc: string;
  paidOnUtc: string | null;
  subscriptionPeriodId: string;
  parentDisplayName: string;
  programName: string | null;
  classroom: string | null;
  cadence: string;
  periodStartedOnUtc: string;
}

export interface ListTenantInvoicesResponse {
  items: TenantInvoiceItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface InstitutionInvoicesHttpError extends Error {
  status: number;
  code?: string;
}

export interface ListTenantInvoicesParams {
  page?: number;
  pageSize?: number;
  status?: TenantInvoiceStatus | null;
}

@Injectable({ providedIn: 'root' })
export class InstitutionInvoicesApiService {
  async list(
    tenantId: string,
    params: ListTenantInvoicesParams = {},
  ): Promise<ListTenantInvoicesResponse> {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const response = await fetch(
      `/api/v1/billing/institutions/${encodeURIComponent(tenantId)}/invoices${suffix}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      },
    );

    if (response.ok) {
      const text = await response.text();
      return text
        ? (JSON.parse(text) as ListTenantInvoicesResponse)
        : { items: [], page: 1, pageSize: 25, totalCount: 0 };
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
      if (payload.code) code = payload.code;
      else if (payload.error) code = payload.error;
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as InstitutionInvoicesHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useInstitutionInvoices = (): InstitutionInvoicesApiService =>
  inject(InstitutionInvoicesApiService);
