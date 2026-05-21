import { Injectable, inject } from '@angular/core';

/**
 * HTTP client for the parent-side invoice listing surface, mirroring
 * `Wayel.Api.Endpoints.MeParentEndpoints` (ParentPolicy):
 *
 * - `GET /api/v1/me/parent/invoices?page=&pageSize=&status=`
 *   — every Layer-B invoice raised against a subscription period the
 *   signed-in parent owns (proforma + paid + past-due + refunded …).
 *   Newest issued first.
 *
 * The response is a flat row-per-invoice shape — server-side joins
 * already resolved child display name, institution name, classroom and
 * cadence, so the SPA just renders the list without follow-up calls.
 *
 * Errors throw a {@link MyParentInvoicesHttpError} so the SPA can
 * render targeted UX (`status` carries the HTTP code, `code` the Wayel
 * error code when the API surfaces one).
 */

export type MyInvoiceStatus =
  | 'Draft'
  | 'Issued'
  | 'Paid'
  | 'PartiallyRefunded'
  | 'Refunded'
  | 'Voided'
  | 'PastDue'
  | 'Proforma';

export interface MyInvoiceItem {
  invoiceId: string;
  number: string;
  status: MyInvoiceStatus;
  totalCents: number;
  currency: string;
  formattedTotal: string;
  issuedOnUtc: string;
  dueOnUtc: string;
  paidOnUtc: string | null;
  subscriptionPeriodId: string;
  parentChildId: string;
  childDisplayName: string;
  institutionId: string;
  institutionName: string;
  classroom: string | null;
  cadence: string;
  periodStartedOnUtc: string;
}

export interface MyInvoiceLineItem {
  description: string;
  unitAmountCents: number;
  quantity: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  formattedUnitAmount: string;
  formattedSubtotal: string;
  formattedVat: string;
  formattedTotal: string;
}

export interface MyInvoiceDetail {
  invoiceId: string;
  number: string;
  status: MyInvoiceStatus;
  currency: string;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  refundedCents: number;
  formattedSubtotal: string;
  formattedVat: string;
  formattedTotal: string;
  formattedRefunded: string;
  issuedOnUtc: string;
  dueOnUtc: string;
  paidOnUtc: string | null;
  lineItems: MyInvoiceLineItem[];
  subscriptionPeriodId: string;
  parentChildId: string;
  childDisplayName: string;
  institutionId: string;
  institutionName: string;
  classroom: string | null;
  cadence: string;
  periodStartedOnUtc: string;
  parentDisplayName: string;
  parentEmail: string;
}

export interface ListMyInvoicesResponse {
  items: MyInvoiceItem[];
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface EmailMyInvoiceResult {
  deliveredTo: string;
}

export interface MyParentInvoicesHttpError extends Error {
  status: number;
  code?: string;
}

export interface ListMyInvoicesParams {
  page?: number;
  pageSize?: number;
  status?: MyInvoiceStatus | null;
}

@Injectable({ providedIn: 'root' })
export class MyParentInvoicesApiService {
  async list(
    params: ListMyInvoicesParams = {},
  ): Promise<ListMyInvoicesResponse> {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    if (params.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const response = await fetch(`/api/v1/me/parent/invoices${suffix}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.ok) {
      const text = await response.text();
      return text
        ? (JSON.parse(text) as ListMyInvoicesResponse)
        : { items: [], page: 1, pageSize: 25, totalCount: 0 };
    }

    throw await this.toHttpError(response);
  }

  async get(invoiceId: string): Promise<MyInvoiceDetail> {
    const response = await fetch(
      `/api/v1/me/parent/invoices/${encodeURIComponent(invoiceId)}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    if (response.ok) {
      return (await response.json()) as MyInvoiceDetail;
    }
    throw await this.toHttpError(response);
  }

  /**
   * Trigger the parent-facing "email me my invoice" flow. The backend
   * is rate-limited (3 sends per (parent, invoice) per 24h); a denial
   * surfaces here as `MyParentInvoicesHttpError` with `status === 409`
   * and `code === 'invoice.email_rate_limit_exceeded'`.
   */
  async email(invoiceId: string): Promise<EmailMyInvoiceResult> {
    const response = await fetch(
      `/api/v1/me/parent/invoices/${encodeURIComponent(invoiceId)}/email`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
    if (response.ok) {
      const text = await response.text();
      return text
        ? (JSON.parse(text) as EmailMyInvoiceResult)
        : { deliveredTo: '' };
    }
    throw await this.toHttpError(response);
  }

  /**
   * Fetch the rendered PDF as a `Blob` so the SPA can save-as / open
   * in a new tab without the page navigating off the detail view.
   * Auth-gated by the parent's session cookie / bearer just like the
   * JSON endpoints.
   */
  async downloadPdf(invoiceId: string): Promise<Blob> {
    const response = await fetch(
      `/api/v1/me/parent/invoices/${encodeURIComponent(invoiceId)}/pdf`,
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/pdf' },
      },
    );
    if (response.ok) {
      return await response.blob();
    }
    throw await this.toHttpError(response);
  }

  /**
   * Pure URL builder for the PDF endpoint — useful when the consumer
   * wants to render an `<a download>` rather than streaming the
   * response themselves. Does NOT include credentials; the browser
   * sends the auth cookie automatically when navigating from the SPA.
   */
  pdfUrl(invoiceId: string): string {
    return `/api/v1/me/parent/invoices/${encodeURIComponent(invoiceId)}/pdf`;
  }

  private async toHttpError(
    response: Response,
  ): Promise<MyParentInvoicesHttpError> {
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
      else if (payload.type) {
        // ProblemDetails 'type' is `https://wayel.dev/errors/<code>` —
        // peel the last path segment so the SPA can pattern-match.
        try {
          const url = new URL(payload.type);
          const last = url.pathname.split('/').filter(Boolean).pop();
          if (last) code = last;
        } catch {
          // 'type' wasn't a real URL — ignore.
        }
      }
    } catch {
      // Body wasn't JSON — keep the default detail.
    }

    const err = new Error(detail) as MyParentInvoicesHttpError;
    err.status = response.status;
    err.code = code;
    return err;
  }
}

export const useMyParentInvoices = (): MyParentInvoicesApiService =>
  inject(MyParentInvoicesApiService);
