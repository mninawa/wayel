import { Injectable, inject } from '@angular/core';
import { wayelAdminFetch } from './wayel-admin-http';

/**
 * HTTP client for the subscription periods surface
 * (`/api/v1/subscription-periods/...`), called from the REMOVED
 * tenant workspace.
 *
 * SuperAdmins use the `?tenantId=` override to read another tenant's
 * subscriptions — the API enforces the elevation server-side via
 * `EffectiveTenant`.
 */
export interface WayelSubscriptionPeriodSummary {
  subscriptionPeriodId: string;
  institutionId: string;
  institutionName: string;
  parentId: string;
  parentChildId: string;
  institutionChildId: string | null;
  startedOnUtc: string;
  archivedOnUtc: string | null;
  archiveReason: string | null;
  isActive: boolean;
  /**
   * Joined-in fields populated by the backend handler from the parent
   * aggregate. They are nullable because the join can miss (orphaned
   * subscription rows) — the UI must guard against `null` and fall back
   * to the bare `parentId` / `parentChildId` for display.
   */
  parentDisplayName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  /**
   * Extended guardian profile fields the parent fills in on
   * `/parent/profile` (title, ID document, mobile / telephone split,
   * financial billing email). Surfaced flat on the row so the
   * workspace parent-profile drawer can render the staff-vetting view
   * without a follow-up fetch. Every field is null until the parent
   * has filled in the matching value.
   */
  parentTitle: WayelGuardianTitle | null;
  parentFirstName: string | null;
  parentLastName: string | null;
  parentIdType: WayelGuardianIdType | null;
  parentIdNumber: string | null;
  parentMobile: string | null;
  parentTelephone: string | null;
  parentFinancialEmail: string | null;
  childDisplayName: string | null;
  /** ISO `yyyy-MM-dd` */
  childDateOfBirth: string | null;
  childPhotoUrl: string | null;
  /**
   * Best-fit programme + latest fee resolved at query time by the API.
   * The handler picks the active programme whose age window covers the
   * child's age (tightest window wins, single-programme tenants
   * auto-match every period). All fields are <c>null</c> when no match
   * is possible — the SPA renders "Unmatched / No fee" in that case.
   */
  matchedProgramId: string | null;
  matchedProgramName: string | null;
  matchedProgramKind: WayelProgramKind | null;
  matchedProgramSchedule: WayelProgramSchedule | null;
  latestFeeYear: number | null;
  latestFeeAmount: number | null;
  latestFeeCurrency: string | null;
  latestFeeCadence: WayelProgramFeeCadence | null;
}

/** Wire enum for {@link WayelSubscriptionPeriodSummary.matchedProgramKind}. */
export type WayelProgramKind = 'Daycare' | 'Session';
/** Wire enum for {@link WayelSubscriptionPeriodSummary.matchedProgramSchedule}. */
export type WayelProgramSchedule = 'FullDay' | 'HalfDay';
/** Wire enum for {@link WayelSubscriptionPeriodSummary.latestFeeCadence}. */
export type WayelProgramFeeCadence = 'Month' | 'Term' | 'Year';

/** Wire enum for the parent's preferred salutation. Mirrors GuardianTitle on the API. */
export type WayelGuardianTitle =
  | 'Undisclosed'
  | 'Mr'
  | 'Mrs'
  | 'Ms'
  | 'Mx'
  | 'Dr'
  | 'Prof';
/** Wire enum for the parent's ID document type. Mirrors GuardianIdType on the API. */
export type WayelGuardianIdType = 'Undisclosed' | 'RsaId' | 'Passport';

export interface WayelListTenantSubscriptionsResponse {
  items: WayelSubscriptionPeriodSummary[];
  total: number;
  activeCount: number;
  archivedCount: number;
}

/** Wire enum for `POST /subscription-periods/{id}/end` body (matches server). */
export type WayelSubscriptionEndReason =
  | 'Unspecified'
  | 'ChildGraduated'
  | 'ChildWithdrawn'
  | 'TermCompleted'
  | 'RenewalLapsed'
  | 'ParentCancelled'
  | 'InstitutionTerminated';

export interface WayelEndSubscriptionPeriodBody {
  endReason?: WayelSubscriptionEndReason;
  note?: string | null;
  /** ISO `yyyy-MM-dd`; when set in the future, the period is scheduled to end on that day. */
  scheduledEndsOn?: string | null;
}

export interface WayelSubscriptionsSummary {
  activeSubscriptions: number;
  archivedSubscriptions: number;
  totalSubscriptions: number;
  startedLast30Days: number;
  archivedLast30Days: number;
  estimatedMrrAmount: number;
  currency: string;
  feeProgramCount: number;
  totalActiveProgramCount: number;
  mrrAccuracy: string;
}

const base = '/api/v1/subscription-periods';

@Injectable({ providedIn: 'root' })
export class WayelAdminSubscriptionsService {
  list(
    tenantId: string,
    activeOnly: boolean | null = null,
  ): Promise<WayelListTenantSubscriptionsResponse> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    if (activeOnly != null) params.set('activeOnly', String(activeOnly));
    return wayelAdminFetch<WayelListTenantSubscriptionsResponse>(
      `${base}?${params.toString()}`,
      { method: 'GET' },
    );
  }

  summary(tenantId: string): Promise<WayelSubscriptionsSummary> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    return wayelAdminFetch<WayelSubscriptionsSummary>(
      `${base}/summary?${params.toString()}`,
      { method: 'GET' },
    );
  }

  /**
   * Staff / workspace termination — immediate end or future
   * {@link WayelEndSubscriptionPeriodBody.scheduledEndsOn}.
   */
  endPeriod(
    tenantId: string,
    subscriptionPeriodId: string,
    body: WayelEndSubscriptionPeriodBody,
  ): Promise<unknown> {
    const params = new URLSearchParams();
    params.set('tenantId', tenantId);
    const payload: WayelEndSubscriptionPeriodBody = {};
    if (body.endReason != null) payload.endReason = body.endReason;
    if (body.note != null && body.note !== '') payload.note = body.note;
    if (body.scheduledEndsOn != null && body.scheduledEndsOn !== '') {
      payload.scheduledEndsOn = body.scheduledEndsOn;
    }
    return wayelAdminFetch(
      `${base}/${encodeURIComponent(subscriptionPeriodId)}/end?${params.toString()}`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
  }
}

export const useWayelAdminSubscriptions = (): WayelAdminSubscriptionsService =>
  inject(WayelAdminSubscriptionsService);
