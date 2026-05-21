import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PLATFORM_API_URL } from '../core/tokens/platform-api-url.token';

/**
 * HTTP client for the staff "me" surface served at /api/v1/me/staff/*.
 *
 * Bearer tokens are stamped by `accountAuthInterceptor`; the API enforces
 * tenant scoping from the bearer's claims so callers never need to pass
 * an institution id.
 */
@Injectable({ providedIn: 'root' })
export class StaffApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = inject(PLATFORM_API_URL);

  private base(): string {
    return this.apiUrl || '';
  }

  /**
   * Identity of the signed-in staff user. The SPA reads this on first
   * load so it can compare `staffMemberId` against `teacherStaffId` /
   * `assistantStaffId` on program rows and label "Teacher" vs
   * "Assistant" pills accordingly.
   */
  getMyProfile(): Observable<StaffProfile> {
    return this.http
      .get<WireStaffProfile>(`${this.base()}/api/v1/me/staff`)
      .pipe(map(fromWireProfile));
  }

  /**
   * Institutions where the signed-in staff user has a seat. Today the API
   * returns at most one row (single-tenant staff), but the surface is
   * already plural-shaped for the multi-tenant rollout.
   */
  listMyInstitutions(): Observable<StaffInstitution[]> {
    return this.http
      .get<{ institutions: WireStaffInstitution[] }>(`${this.base()}/api/v1/me/staff/institutions`)
      .pipe(map((r) => (r?.institutions ?? []).map(fromWireInstitution)));
  }

  /**
   * Programs the signed-in staff user is assigned to (Teacher or Assistant).
   */
  listMyPrograms(): Observable<StaffProgram[]> {
    return this.http
      .get<{ programs: WireStaffProgram[] }>(`${this.base()}/api/v1/me/staff/programs`)
      .pipe(map((r) => (r?.programs ?? []).map(fromWireProgram)));
  }

  /**
   * Roster for one program the staff user is on. Ordered by display name.
   */
  getProgramRoster(programId: string): Observable<StaffProgramRoster> {
    return this.http
      .get<WireStaffProgramRoster>(
        `${this.base()}/api/v1/me/staff/programs/${encodeURIComponent(programId)}/roster`,
      )
      .pipe(map(fromWireRoster));
  }
}

// --- Public Phase 0-style projections --------------------------------------

export interface StaffProfile {
  staffMemberId: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: string;
}

export interface StaffInstitution {
  id: string;
  name: string;
  slug: string;
  displayName: string | null;
  logoUrl: string | null;
  /** Cover image from the public profile, distinct from the logo. */
  imageUrl: string | null;
  primaryColor: string | null;
  /** Lifecycle state: "Active" | "Suspended" | "Archived". */
  status: string;
  category: string | null;
  tagline: string | null;
  /** "Daycare" | "Session" | "Unknown" — drives the Full day / Session pill. */
  kind: string;
  /** Billing plan ("Starter", "Professional", …); "Unspecified" when not set. */
  plan: string;
  /** Headline ZAR fee, or null for "fees vary". */
  monthlyFeeZar: number | null;
  /** Published min/max age in years (both null = "all ages"). */
  ageMinYears: number | null;
  ageMaxYears: number | null;
  city: string | null;
  area: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  programCount: number;
  staffCount: number;
  /** Active enrolments at the institution. */
  childrenCount: number;
  /** Programs where the signed-in staff member is Teacher or Assistant. */
  myProgramCount: number;
  role: string;
}

export interface StaffProgram {
  id: string;
  name: string;
  /** Free-text age band, e.g. "3-4 yrs". */
  ageRange: string;
  institutionId: string;
  institutionName: string;
  enrolledCount: number;
  /**
   * User id of the assigned Teacher / Assistant. Compare against
   * `StaffProfile.staffMemberId` to render the role pill. `null` when
   * the slot is vacant.
   */
  teacherStaffId: string | null;
  assistantStaffId: string | null;
}

export interface StaffProgramRosterEntry {
  childId: string;
  displayName: string;
  dateOfBirth: string;
  membershipState: string;
  parentChildId: string | null;
  parentId: string | null;
  guardianNames: string[];
}

export interface StaffProgramRoster {
  programId: string;
  programName: string;
  institutionId: string;
  institutionName: string;
  roster: StaffProgramRosterEntry[];
}

// --- Wire shapes -----------------------------------------------------------

interface WireStaffProfile {
  staffMemberId: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  role: string;
}

interface WireStaffInstitution {
  id: string;
  name: string;
  slug: string;
  displayName: string | null;
  logoUrl: string | null;
  imageUrl: string | null;
  primaryColor: string | null;
  status: string;
  category: string | null;
  tagline: string | null;
  kind: string;
  plan: string;
  monthlyFeeZar: number | null;
  ageMinYears: number | null;
  ageMaxYears: number | null;
  city: string | null;
  area: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  programCount: number;
  staffCount: number;
  childrenCount: number;
  myProgramCount: number;
  role: string;
}

interface WireStaffProgram {
  id: string;
  name: string;
  ageRange: string;
  institutionId: string;
  institutionName: string;
  enrolledCount: number;
  teacherStaffId: string | null;
  assistantStaffId: string | null;
}

interface WireStaffProgramRosterEntry {
  childId: string;
  displayName: string;
  dateOfBirth: string;
  membershipState: string;
  parentChildId: string | null;
  parentId: string | null;
  guardianNames: string[] | null;
}

interface WireStaffProgramRoster {
  programId: string;
  programName: string;
  institutionId: string;
  institutionName: string;
  roster: WireStaffProgramRosterEntry[] | null;
}

function fromWireProfile(w: WireStaffProfile): StaffProfile {
  return { ...w };
}

function fromWireInstitution(w: WireStaffInstitution): StaffInstitution {
  return { ...w };
}

function fromWireProgram(w: WireStaffProgram): StaffProgram {
  return { ...w };
}

function fromWireRoster(w: WireStaffProgramRoster): StaffProgramRoster {
  return {
    programId: w.programId,
    programName: w.programName,
    institutionId: w.institutionId,
    institutionName: w.institutionName,
    roster: (w.roster ?? []).map((e) => ({
      childId: e.childId,
      displayName: e.displayName,
      dateOfBirth: e.dateOfBirth,
      membershipState: e.membershipState,
      parentChildId: e.parentChildId,
      parentId: e.parentId,
      guardianNames: e.guardianNames ?? [],
    })),
  };
}
