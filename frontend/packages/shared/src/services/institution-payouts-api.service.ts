import { Injectable, inject } from '@angular/core';
import { bffStateChangingHeaders } from './bff-auth.service';

/**
 * HTTP client for the institution payout-account surface, mirroring
 * `Wayel.Api.Endpoints.BillingPayoutEndpoints` (TenantAdmin-or-above):
 *
 * - `GET    /api/v1/billing/banks?country=ZA` — Paystack bank directory
 *   (cached server-side for 24 hours), used to populate the bank
 *   dropdown.
 * - `POST   /api/v1/billing/banks/resolve` — pre-flight account-number
 *   resolution. The handler calls Paystack's `/bank/resolve` and
 *   echoes back the canonical account-holder name so the staff user
 *   can confirm "yes, that's our account" before we mint the
 *   subaccount.
 * - `GET    /api/v1/billing/institutions/{tenantId}/payout-account`
 *   — current configured payout account (or `null` empty-state).
 * - `POST   /api/v1/billing/institutions/{tenantId}/payout-account`
 *   — configure (first-time) or rotate. The platform does NOT store
 *   the raw account number; it travels server-side, lands on
 *   Paystack's `/subaccount`, and only the `subaccount_code` +
 *   masked last4 come back here for persistence.
 * - `DELETE /api/v1/billing/institutions/{tenantId}/payout-account`
 *   — soft-deactivate (renewal ticker hard-blocks until reactivated).
 *
 * Errors throw a {@link InstitutionPayoutsHttpError} carrying the
 * Wayel error code (e.g. `payout_account.bank_resolve_failed`,
 * `payout_account.subaccount_create_failed`,
 * `payout_account.not_found`) so the SPA can render targeted UX.
 */

export interface BankDirectoryItem {
  code: string;
  name: string;
  slug: string | null;
  country: string;
  currency: string;
  type: string | null;
  /**
   * Provider's universal sort/branch code (e.g. `"250655"` for FNB ZA
   * on Paystack). Some entries omit it — the staff verify panel only
   * surfaces the "Branch code" row when this is non-null.
   */
  longCode: string | null;
}

export interface ListBanksResponse {
  items: BankDirectoryItem[];
}

export interface ResolveBankAccountResponse {
  accountNumber: string;
  accountName: string;
  /** Provider's stable bank identifier (Paystack `bank_id`). */
  bankId: string | null;
  /**
   * `true` when the bank confirmed the supplied details. NUBAN-style
   * resolutions (NG / GH) are always `true` on success; AVS-style
   * validations (ZA via `/bank/validate`) reflect the provider's
   * `verified` flag.
   */
  verified: boolean;
  /**
   * Provider's human-readable verification message — surfaced
   * verbatim on the staff verify panel ("Account is verified
   * successfully" vs. "Account name does not match").
   */
  verificationMessage: string | null;
}

/**
 * Optional ID-document tuple required for ZA AVS-style account
 * validation (Paystack `/bank/validate`). Forwarded transiently to
 * the gateway; the platform never persists these fields.
 */
export interface AccountValidationFields {
  /** Account-holder name as it appears on the bank statement. */
  accountName: string;
  /** `'personal'` or `'business'`. */
  accountType: 'personal' | 'business';
  /**
   * `'identityNumber'` (RSA ID) | `'passportNumber'` |
   * `'businessRegistrationNumber'` (CIPC / similar).
   */
  documentType:
    | 'identityNumber'
    | 'passportNumber'
    | 'businessRegistrationNumber';
  /** ID / passport / business-registration number (digits-only). */
  documentNumber: string;
}

export interface MyPayoutAccount {
  payoutAccountId: string;
  providerName: string;
  providerSubaccountRef: string;
  bankCode: string;
  bankName: string;
  accountHolder: string;
  accountLast4: string;
  active: boolean;
  createdOnUtc: string;
  updatedOnUtc: string;
  deactivatedOnUtc: string | null;
  deactivationReason: string | null;
  /**
   * True when the record was saved via the manual / record-keeping
   * path (no real Paystack subaccount exists). Layer-B renewal
   * charges are still gated until the institution rotates to a real
   * gateway-managed subaccount; the staff settings UI surfaces a
   * dedicated "manual entry" badge so this isn't surprising.
   */
  isManual?: boolean;
}

export interface ConfigurePayoutAccountResponse {
  payoutAccountId: string;
  providerName: string;
  providerSubaccountRef: string;
  bankCode: string;
  bankName: string;
  accountHolder: string;
  accountLast4: string;
  active: boolean;
  isManual?: boolean;
}

/**
 * Resolved annual open/close envelope for an institution. The server
 * always returns the *effective* window — never null — so the SPA can
 * render the dates without re-applying the platform-default fallback.
 * `isCustom = false` means "this institution is using the platform
 * default" and should drive the "Reset to default" affordance in the
 * settings UI.
 */
export interface InstitutionSubscriptionWindow {
  tenantId: string;
  openMonth: number;
  openDay: number;
  closeMonth: number;
  closeDay: number;
  isCustom: boolean;
}

export interface InstitutionPayoutsHttpError extends Error {
  status: number;
  code?: string;
}

@Injectable({ providedIn: 'root' })
export class InstitutionPayoutsApiService {
  private readonly baseHeaders: HeadersInit = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  async listBanks(country = 'ZA'): Promise<ListBanksResponse> {
    return this.request<ListBanksResponse>(
      `/api/v1/billing/banks?country=${encodeURIComponent(country)}`,
      { method: 'GET' },
    );
  }

  /**
   * Pre-flight account verification.
   *
   * For ZA, pass `validation` populated with the holder's name +
   * account type + ID document. The server forwards the tuple to
   * Paystack's `/bank/validate` endpoint (AVS-style match — it
   * confirms the supplied name, it doesn't return a canonical one).
   *
   * For NG / GH / KE, omit `validation`. The server falls through to
   * Paystack's `/bank/resolve` endpoint, which returns the canonical
   * holder name from the account number alone.
   */
  async resolveAccount(
    bankCode: string,
    accountNumber: string,
    country?: string,
    validation?: AccountValidationFields,
  ): Promise<ResolveBankAccountResponse> {
    return this.request<ResolveBankAccountResponse>(
      '/api/v1/billing/banks/resolve',
      {
        method: 'POST',
        body: JSON.stringify({
          bankCode,
          accountNumber,
          country,
          ...(validation
            ? {
                accountName: validation.accountName,
                accountType: validation.accountType,
                documentType: validation.documentType,
                documentNumber: validation.documentNumber,
              }
            : {}),
        }),
      },
    );
  }

  async getPayoutAccount(tenantId: string): Promise<MyPayoutAccount | null> {
    return this.request<MyPayoutAccount | null>(
      `/api/v1/billing/institutions/${encodeURIComponent(tenantId)}/payout-account`,
      { method: 'GET' },
    );
  }

  async configure(
    tenantId: string,
    body: {
      bankCode: string;
      accountNumber: string;
      businessName?: string;
      /** ISO-2 country the bank code is registered under. Defaults to ZA on the server. */
      country?: string;
      /**
       * When `true`, the API skips both the Paystack `/bank/resolve`
       * pre-flight and the `/subaccount` creation. Used to escape the
       * "country_unsupported" dead-end when the institution sits in a
       * country the configured Paystack merchant can't service
       * (e.g. ZA today). Layer-B renewal charges are still blocked
       * on the resulting record — the toggle is purely so staff can
       * save their bank details for reference.
       */
      manual?: boolean;
      /**
       * Required when `manual` is `true`: account-holder name as the
       * staff user types it (the gateway would normally resolve this
       * via `/bank/resolve`).
       */
      accountHolder?: string;
      /**
       * Optional override for the human-readable bank name in manual
       * mode. Only honoured when the server's directory lookup fails
       * to produce a name itself.
       */
      bankName?: string;
      /**
       * `'personal'` or `'business'`. Required for the ZA AVS-style
       * configure path; the server forwards it to Paystack's
       * `/bank/validate` endpoint together with the document tuple
       * below.
       */
      accountType?: 'personal' | 'business';
      /**
       * `'identityNumber'` | `'passportNumber'` |
       * `'businessRegistrationNumber'`. Required alongside
       * `documentNumber` for the ZA AVS path.
       */
      documentType?:
        | 'identityNumber'
        | 'passportNumber'
        | 'businessRegistrationNumber';
      /**
       * Holder's ID / passport / business-registration number.
       * Required for the ZA AVS path. Forwarded transiently to the
       * gateway and never persisted.
       */
      documentNumber?: string;
    },
  ): Promise<ConfigurePayoutAccountResponse> {
    return this.request<ConfigurePayoutAccountResponse>(
      `/api/v1/billing/institutions/${encodeURIComponent(tenantId)}/payout-account`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  async deactivate(tenantId: string, reason?: string): Promise<void> {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    await this.request<void>(
      `/api/v1/billing/institutions/${encodeURIComponent(tenantId)}/payout-account${qs}`,
      { method: 'DELETE' },
    );
  }

  /**
   * Returns the institution's resolved subscription window. Always
   * carries an effective open/close pair (custom or platform
   * default). 404 surfaces as a thrown error.
   */
  async getSubscriptionWindow(tenantId: string): Promise<InstitutionSubscriptionWindow> {
    return this.request<InstitutionSubscriptionWindow>(
      `/api/v1/billing/institutions/${encodeURIComponent(tenantId)}/subscription-window`,
      { method: 'GET' },
    );
  }

  /**
   * Sets a custom subscription window for the institution. Pass
   * `null` for every field to reset to the platform default
   * (8 Jan – 10 Dec).
   *
   * The server validates the month/day pairs through
   * `SubscriptionWindow.Create` and rejects partial payloads with a
   * typed `subscription_window.partial_payload` error — pass all
   * four fields together or all four nulls.
   */
  async setSubscriptionWindow(
    tenantId: string,
    body: {
      openMonth: number | null;
      openDay: number | null;
      closeMonth: number | null;
      closeDay: number | null;
    },
  ): Promise<InstitutionSubscriptionWindow> {
    return this.request<InstitutionSubscriptionWindow>(
      `/api/v1/billing/institutions/${encodeURIComponent(tenantId)}/subscription-window`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
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

    const err = new Error(detail) as InstitutionPayoutsHttpError;
    err.status = response.status;
    err.code = code;
    throw err;
  }
}

export const useInstitutionPayouts = (): InstitutionPayoutsApiService =>
  inject(InstitutionPayoutsApiService);
