import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '@app/environment';
import {
  EMPTY_PHASE0_CHILD_PROFILE,
  EMPTY_PHASE0_GUARDIAN_PROFILE,
  type Phase0AddParentChildRequest,
  type Phase0AddParentChildResponse,
  type Phase0ChildProfile,
  type Phase0CreateMemoryRequest,
  type Phase0GuardianIdType,
  type Phase0GuardianProfile,
  type Phase0GuardianTitle,
  type Phase0LifetimeArchive,
  type Phase0LifetimeArchivePeriod,
  type Phase0ListParentsQuery,
  type Phase0Memory,
  type Phase0OnboardParentRequest,
  type Phase0OnboardParentResponse,
  type Phase0Parent,
  type Phase0ParentChild,
  type Phase0ParentListResult,
} from '../core/contracts/parents.phase0';
import {
  MOCK_PARENTS,
  type MockChildGender,
  type MockChildProfile,
  type MockGuardianIdType,
  type MockGuardianTitle,
  type MockMemory,
  type MockParent,
  type MockParentChild,
  type MockParentChildSubscription,
} from '../core/mock/mock-parents';
import {
  ParentsApiService,
  type MeParentPatchChildBody,
  type MyParentSubscriptionRow,
  type WireEndorsingCurator,
  type WirePreferredPartner,
} from './parents-api.service';
import {
  listPreferredPartnersForParent,
  type EndorsementInstitution,
  type PreferredEndorsement,
} from './workspace-partnership';

const CURRENT_INSTITUTION = {
  id: 'tenant_little_stars',
  name: 'Little Stars Preschool',
} as const;

const OTHER_INSTITUTIONS: Array<{ id: string; name: string }> = [
  { id: 'inst_aqua_stars', name: 'Aqua Stars Swim Academy' },
  { id: 'inst_kintaro_karate', name: 'Kintaro Karate Dojo' },
  { id: 'inst_brushstrokes', name: 'Brushstrokes Art Studio' },
  { id: 'inst_sonata_music', name: 'Sonata Music School' },
];

function institutionFor(id: string): { id: string; name: string } {
  if (id === CURRENT_INSTITUTION.id) return CURRENT_INSTITUTION;
  return OTHER_INSTITUTIONS.find((i) => i.id === id) ?? { id, name: id };
}

export interface ParentsListResult {
  items: Phase0Parent[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/**
 * Bridge for the parent-app surface. In mock mode it owns the in-memory parent
 * table from `core/mock/mock-parents` and serves directly; in live mode it
 * delegates to `ParentsApiService`.
 *
 * Other bridges (children, subscription-requests) reach into the same in-memory
 * table via the helpers exported from `core/mock/mock-parents` so the
 * simulator, inbox, and roster all stay coherent within a session.
 */
@Injectable({ providedIn: 'root' })
export class ParentsBridgeService {
  private readonly api = inject(ParentsApiService);

  list(query: Phase0ListParentsQuery = {}): Observable<ParentsListResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    if (environment.useMock) {
      const search = query.search?.trim().toLowerCase();
      let rows = [...MOCK_PARENTS];
      if (search) {
        rows = rows.filter((p) =>
          `${p.displayName} ${p.email}`.toLowerCase().includes(search),
        );
      }
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize).map(toDto);
      return of({ items, totalCount, page, pageSize });
    }

    return this.api.list({ ...query, page, pageSize });
  }

  get$(id: string): Observable<Phase0Parent> {
    if (environment.useMock) {
      const p = MOCK_PARENTS.find((x) => x.id === id);
      if (!p) return throwError(() => new Error(`No parent with id "${id}".`));
      return of(toDto(p));
    }
    // The parent portal calls this with its own session parent id. The
    // staff endpoint /api/v1/parents/{id} would 403 here — every consumer
    // of this bridge in the SPA is a parent reading their own profile, so
    // we route through /api/v1/me/parent (auth-identity-scoped). The id
    // param is preserved in the signature for mock/admin parity but the
    // live API uses the bearer.
    void id;
    return this.api.getMe();
  }

  /**
   * Save the parent's "My profile" form. In live mode this hits
   * `PATCH /api/v1/me/parent` and the server is authoritative. In mock
   * mode we mutate the in-memory parent so the same flow lights up
   * during demos / Playwright runs.
   */
  patchMeProfile(
    parentId: string,
    body: {
      displayName?: string | null;
      phone?: string | null;
      clearPhone?: boolean;
      profile?: Phase0GuardianProfile;
    },
  ): Observable<Phase0Parent> {
    if (environment.useMock) {
      const mock = MOCK_PARENTS.find((p) => p.id === parentId);
      if (!mock) return throwError(() => new Error('Parent not found.'));
      if (body.displayName != null && body.displayName.trim().length > 0) {
        mock.displayName = body.displayName.trim();
      }
      if (body.clearPhone) {
        mock.phone = null;
      } else if (body.phone != null) {
        const trimmed = body.phone.trim();
        mock.phone = trimmed.length === 0 ? null : trimmed;
      }
      if (body.profile) {
        // The mock layer exposes a slightly different shape (typed
        // title strings + "RSA ID"/"Passport"); collapse the wire enum
        // back into it so the rest of the mock UI keeps reading the
        // values correctly.
        const titleBack: Record<Phase0GuardianTitle, MockGuardianTitle | null> = {
          Undisclosed: 'Undisclosed',
          Mr: 'Mr',
          Mrs: 'Mrs',
          Ms: 'Ms',
          // No "Mx" in the mock vocabulary — fold to "Undisclosed" so
          // the mock-side drawer still renders sanely.
          Mx: 'Undisclosed',
          Dr: 'Dr',
          Prof: 'Prof',
        };
        const idBack: Record<Phase0GuardianIdType, MockGuardianIdType | null> = {
          Undisclosed: null,
          RsaId: 'RSA ID',
          Passport: 'Passport',
        };
        mock.profile = {
          title: titleBack[body.profile.title],
          firstName: body.profile.firstName,
          lastName: body.profile.lastName,
          idNumberType: idBack[body.profile.idType],
          idNumber: body.profile.idNumber,
          mobile: body.profile.mobile,
          telephone: body.profile.telephone,
          financialEmail: body.profile.financialEmail,
        };
      }
      return of(toDto(mock));
    }
    void parentId;
    return this.api.patchMeProfile({
      displayName: body.displayName ?? undefined,
      phone: body.phone ?? undefined,
      clearPhone: body.clearPhone,
      profile: body.profile ?? null,
    });
  }

  onboard(
    body: Phase0OnboardParentRequest,
  ): Observable<Phase0OnboardParentResponse> {
    if (environment.useMock) {
      const error = validateOnboard(body);
      if (error) return throwError(() => new Error(error));
      const email = body.email.trim().toLowerCase();
      if (
        MOCK_PARENTS.some((p) => p.email.toLowerCase() === email)
      ) {
        return throwError(
          () =>
            new Error(`A parent with email "${body.email}" already exists.`),
        );
      }
      const id = `parent_${randomId()}`;
      const createdAt = new Date().toISOString();
      const parent: MockParent = {
        id,
        displayName: body.displayName.trim(),
        email: body.email.trim(),
        phone: body.phone?.trim() || null,
        createdAt,
        children: (body.children ?? []).map((c) => ({
          id: `pchild_${randomId()}`,
          displayName: c.displayName.trim(),
          dateOfBirth: c.dateOfBirth,
          notes: c.notes?.trim() || null,
          photoUrl: c.photoUrl?.trim() || null,
          subscriptions: [],
        })),
      };
      MOCK_PARENTS.push(parent);
      return of({ parent: toDto(parent) });
    }
    return this.api.onboard(body);
  }

  addChild(
    parentId: string,
    body: Phase0AddParentChildRequest,
  ): Observable<Phase0AddParentChildResponse> {
    if (environment.useMock) {
      const parent = MOCK_PARENTS.find((p) => p.id === parentId);
      if (!parent)
        return throwError(() => new Error(`No parent with id "${parentId}".`));
      if (!body.displayName?.trim())
        return throwError(() => new Error('Display name is required.'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth))
        return throwError(
          () => new Error('Date of birth must be in YYYY-MM-DD format.'),
        );
      const child: MockParentChild = {
        id: `pchild_${randomId()}`,
        displayName: body.displayName.trim(),
        dateOfBirth: body.dateOfBirth,
        notes: body.notes?.trim() || null,
        photoUrl: body.photoUrl?.trim() || null,
        profile: body.profile ? mockProfileFromPhase0(body.profile) : undefined,
        subscriptions: [],
      };
      parent.children.push(child);
      return of({ child: childToDto(child) });
    }
    return this.api.addChild(parentId, body);
  }

  /**
   * Seal one ended period: stamps `archivedAt` (idempotent) and returns the
   * snapshot the parent can keep. Refuses non-ended periods.
   */
  archivePeriod(
    parentId: string,
    parentChildId: string,
    subscriptionId: string,
  ): Observable<Phase0LifetimeArchive> {
    if (environment.useMock) {
      const parent = MOCK_PARENTS.find((p) => p.id === parentId);
      const child = parent?.children.find((c) => c.id === parentChildId);
      const period = child?.subscriptions.find((s) => s.id === subscriptionId);
      if (!parent || !child || !period) {
        return throwError(
          () => new Error('Parent, child or subscription not found.'),
        );
      }
      if (period.state !== 'ended') {
        return throwError(
          () =>
            new Error(
              'Only ended subscription periods can be archived. End the subscription first.',
            ),
        );
      }
      if (!period.archivedAt) {
        period.archivedAt = new Date().toISOString();
      }
      return of(buildSnapshot(parent, child, [period]));
    }
    return this.api.archivePeriod(parentId, parentChildId, subscriptionId);
  }

  /**
   * Export the full lifetime as a self-contained JSON snapshot. Read-only:
   * does not stamp `archivedAt` on anything. Useful for "download all".
   */
  exportLifetime(
    parentId: string,
    parentChildId: string,
  ): Observable<Phase0LifetimeArchive> {
    if (environment.useMock) {
      const parent = MOCK_PARENTS.find((p) => p.id === parentId);
      const child = parent?.children.find((c) => c.id === parentChildId);
      if (!parent || !child) {
        return throwError(() => new Error('Parent or child not found.'));
      }
      return of(buildSnapshot(parent, child, [...child.subscriptions]));
    }
    return this.api.exportLifetime(parentId, parentChildId);
  }

  /**
   * List parent-uploaded memories for a child, newest first.
   */
  listMemories(
    parentId: string,
    parentChildId: string,
  ): Observable<Phase0Memory[]> {
    if (environment.useMock) {
      const child = findChild(parentId, parentChildId);
      if (!child) return throwError(() => new Error('Parent or child not found.'));
      const rows = (child.memories ?? []).slice().sort(byOccurredAtDesc);
      return of(rows.map((m) => memoryToDto(m, parentChildId)));
    }
    return this.api.listMemories(parentId, parentChildId);
  }

  /**
   * Upload a standalone memory for a child. In mock mode the URL is typically
   * a `data:` URL produced by the picker; in live mode the server is
   * responsible for storage.
   */
  addMemory(
    parentId: string,
    parentChildId: string,
    body: Phase0CreateMemoryRequest,
  ): Observable<Phase0Memory> {
    if (environment.useMock) {
      const child = findChild(parentId, parentChildId);
      if (!child) return throwError(() => new Error('Parent or child not found.'));
      if (!body?.url || typeof body.url !== 'string') {
        return throwError(() => new Error('A memory needs a URL or data URL.'));
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.occurredAt || '')) {
        return throwError(() => new Error('Memory date must be YYYY-MM-DD.'));
      }
      const mem: MockMemory = {
        id: `mem_${randomId()}`,
        kind: body.kind === 'video' ? 'video' : 'photo',
        url: body.url,
        caption: body.caption?.trim() || null,
        occurredAt: body.occurredAt,
        createdAt: new Date().toISOString(),
        tag: body.tag?.trim() || null,
        institutionId: body.institutionId || null,
      };
      child.memories = [mem, ...(child.memories ?? [])];
      return of(memoryToDto(mem, parentChildId));
    }
    return this.api.addMemory(parentId, parentChildId, body);
  }

  /**
   * Delete one parent-uploaded memory. Idempotent — returns success even if
   * the memory was already gone.
   */
  removeMemory(
    parentId: string,
    parentChildId: string,
    memoryId: string,
  ): Observable<void> {
    if (environment.useMock) {
      const child = findChild(parentId, parentChildId);
      if (!child) return throwError(() => new Error('Parent or child not found.'));
      child.memories = (child.memories ?? []).filter((m) => m.id !== memoryId);
      return of(undefined);
    }
    return this.api.removeMemory(parentId, parentChildId, memoryId);
  }

  /**
   * Update fields on one roster child. In mock mode mutates `MOCK_PARENTS`;
   * live mode PATCHes `/me/parent/children/{id}`.
   */
  patchChild(
    parentId: string,
    parentChildId: string,
    body: MeParentPatchChildBody,
  ): Observable<Phase0ParentChild> {
    if (environment.useMock) {
      const child = findChild(parentId, parentChildId);
      if (!child) return throwError(() => new Error('Parent or child not found.'));
      if (body.clearPhoto) {
        child.photoUrl = null;
      } else if (body.photoUrl !== undefined) {
        child.photoUrl = body.photoUrl?.trim() ?? null;
      }
      if (body.displayName !== undefined && body.displayName !== null) {
        const next = body.displayName.trim();
        if (next.length > 0) child.displayName = next;
      }
      if (body.dateOfBirth !== undefined && body.dateOfBirth !== null) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(body.dateOfBirth)) {
          child.dateOfBirth = body.dateOfBirth;
        }
      }
      if (body.clearNotes) {
        child.notes = null;
      } else if (body.notes !== undefined) {
        const next = body.notes?.trim();
        child.notes = next && next.length > 0 ? next : null;
      }
      if (body.profile !== undefined && body.profile !== null) {
        child.profile = mockProfileFromPhase0(body.profile);
      }
      return of(childToDto(child));
    }
    return this.api.patchMeChild(parentId, parentChildId, body);
  }

  /**
   * Drop a child from the parent's roster entirely (does not modify
   * institution-side history already captured elsewhere).
   */
  removeChild(
    parentId: string,
    parentChildId: string,
  ): Observable<void> {
    if (environment.useMock) {
      const parent = MOCK_PARENTS.find((p) => p.id === parentId);
      if (!parent) return throwError(() => new Error('Parent not found.'));
      const ix = parent.children.findIndex((c) => c.id === parentChildId);
      if (ix < 0) return throwError(() => new Error('Child not found.'));
      parent.children.splice(ix, 1);
      return of(undefined);
    }
    return this.api.removeMeChild(parentId, parentChildId);
  }

  /**
   * Parent-wide enrolment history for the "My subscriptions" page —
   * returns one row per `SubscriptionPeriod` across every child the
   * parent owns. In mock mode we synthesise rows by walking the
   * in-memory `MOCK_PARENTS.children[].subscriptions` arrays so the
   * mock and live shapes stay aligned.
   */
  listMySubscriptions(parentId: string): Observable<MyParentSubscriptionRow[]> {
    if (environment.useMock) {
      const parent = MOCK_PARENTS.find((p) => p.id === parentId);
      if (!parent) return of([]);
      const rows: MyParentSubscriptionRow[] = [];
      for (const c of parent.children) {
        for (const s of c.subscriptions) {
          rows.push({
            id: s.id,
            parentId: parent.id,
            parentChildId: c.id,
            childDisplayName: c.displayName,
            institutionId: s.institutionId,
            institutionChildId: s.institutionChildId ?? null,
            institutionName: institutionFor(s.institutionId).name,
            startedOnUtc: new Date(`${s.enrolledAt}T00:00:00Z`).toISOString(),
            archivedOnUtc: s.archivedAt
              ? new Date(s.archivedAt).toISOString()
              : null,
            archiveReason: s.endedReason ?? null,
            isActive: s.state === 'active',
          });
        }
      }
      return of(rows);
    }
    void parentId;
    return this.api.listMySubscriptions();
  }

  /**
   * Preferred-partner endorsements for the directory: a map keyed by
   * partner institution id. Drives the "Preferred by …" pill on each
   * `/parent/subscribe` card.
   *
   * Mock mode walks the in-memory mock partnership graph (so demos
   * and Playwright runs work offline). Live mode hits the new
   * `/api/v1/me/parent/preferred-partners` endpoint and adapts the
   * wire shape into the same `Map<string, PreferredEndorsement>`
   * the directory has consumed since the feature shipped — a
   * symmetric contract so the component doesn't have to branch on
   * source.
   *
   * Live errors are swallowed into an empty map. The pill is a
   * trust signal, not load-blocking content; if the live call fails
   * we'd rather render the unbadged catalogue than spam a toast or
   * stall the directory.
   */
  listPreferredPartners(
    parentId: string,
  ): Observable<Map<string, PreferredEndorsement>> {
    if (environment.useMock) {
      return of(listPreferredPartnersForParent(parentId));
    }
    void parentId;
    return this.api.listMyPreferredPartners().pipe(
      map((items) => preferredPartnersFromWire(items)),
      catchError((err) => {
        // Background trust signal — never surface as a toast / banner.
        // We log so the network tab still shows the failure for ops
        // diagnostics, then resolve to "no endorsements" so the page
        // renders the unbadged catalogue.
        console.warn(
          '[ParentsBridge] listPreferredPartners failed; falling back to empty map.',
          err,
        );
        return of(new Map<string, PreferredEndorsement>());
      }),
    );
  }

  /**
   * Schedule the parent-side cancellation of one period — the renewal
   * ticker honours the stamped `scheduledEndsOn` on its next pass.
   * Mock mode mutates the in-memory period so the parent app continues
   * to work without the backend running.
   */
  cancelMyPeriodAtTermEnd(
    parentId: string,
    parentChildId: string,
    subscriptionId: string,
    reason: string | null,
  ): Observable<MyParentSubscriptionRow> {
    if (environment.useMock) {
      const parent = MOCK_PARENTS.find((p) => p.id === parentId);
      const child = parent?.children.find((c) => c.id === parentChildId);
      const period = child?.subscriptions.find((s) => s.id === subscriptionId);
      if (!parent || !child || !period) {
        return throwError(
          () => new Error('Parent, child or subscription not found.'),
        );
      }
      // Mock model has no term-window concept, so stamp endedReason and
      // synthesise a "cancels in ~30 days" hint via the row shape.
      period.endedReason = reason?.trim() || 'Parent requested cancellation';
      const inThirtyDays = new Date();
      inThirtyDays.setDate(inThirtyDays.getDate() + 30);
      const scheduledEndsOn = inThirtyDays.toISOString().slice(0, 10);
      return of({
        id: period.id,
        parentId: parent.id,
        parentChildId: child.id,
        childDisplayName: child.displayName,
        institutionId: period.institutionId,
        institutionChildId: period.institutionChildId ?? null,
        institutionName: institutionFor(period.institutionId).name,
        startedOnUtc: new Date(`${period.enrolledAt}T00:00:00Z`).toISOString(),
        archivedOnUtc: period.archivedAt
          ? new Date(period.archivedAt).toISOString()
          : null,
        archiveReason: period.endedReason ?? null,
        isActive: period.state === 'active',
        scheduledEndsOn,
      });
    }
    void parentId;
    return this.api.cancelMyPeriodAtTermEnd(parentChildId, subscriptionId, reason);
  }
}

function findChild(parentId: string, parentChildId: string): MockParentChild | null {
  const parent = MOCK_PARENTS.find((p) => p.id === parentId);
  return parent?.children.find((c) => c.id === parentChildId) ?? null;
}

function byOccurredAtDesc(a: MockMemory, b: MockMemory): number {
  return a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0;
}

function memoryToDto(m: MockMemory, parentChildId: string): Phase0Memory {
  const inst = m.institutionId ? institutionFor(m.institutionId) : null;
  return {
    id: m.id,
    parentChildId,
    kind: m.kind,
    url: m.url,
    caption: m.caption,
    occurredAt: m.occurredAt,
    createdAt: m.createdAt,
    tag: m.tag,
    institutionId: inst?.id ?? null,
    institutionName: inst?.name ?? null,
  };
}

function buildSnapshot(
  parent: MockParent,
  child: MockParentChild,
  periods: MockParentChildSubscription[],
): Phase0LifetimeArchive {
  const sorted = [...periods].sort((a, b) => {
    const aStart = a.enrolledAt ?? a.events[0]?.occurredAt ?? '';
    const bStart = b.enrolledAt ?? b.events[0]?.occurredAt ?? '';
    return aStart < bStart ? 1 : aStart > bStart ? -1 : 0;
  });
  const memories = (child.memories ?? [])
    .slice()
    .sort(byOccurredAtDesc)
    .map((m) => memoryToDto(m, child.id));
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    parent: {
      id: parent.id,
      displayName: parent.displayName,
      email: parent.email,
      phone: parent.phone,
    },
    child: {
      id: child.id,
      displayName: child.displayName,
      dateOfBirth: child.dateOfBirth,
      notes: child.notes,
      photoUrl: child.photoUrl,
    },
    periods: sorted.map(periodToSnapshot),
    memories,
  };
}

function periodToSnapshot(s: MockParentChildSubscription): Phase0LifetimeArchivePeriod {
  const inst = institutionFor(s.institutionId);
  return {
    id: s.id,
    institutionId: inst.id,
    institutionName: inst.name,
    institutionChildId: s.institutionChildId ?? null,
    state: s.state,
    classroom: s.classroom,
    enrolledAt: s.enrolledAt,
    endedAt: s.endedAt,
    endedReason: s.endedReason,
    archivedAt: s.archivedAt,
    sealed: s.state === 'ended',
    events: s.events.map((e) => ({
      id: e.id,
      occurredAt: e.occurredAt,
      kind: e.kind,
      summary: e.summary,
      details: e.details as Record<string, unknown> | null,
      actorEmail: e.actorEmail,
      actorName: e.actorName,
    })),
  };
}

function toDto(p: MockParent): Phase0Parent {
  // Mock-mode → Phase 0 contract. The mock layer's `MockGuardianProfile`
  // is a near-mirror of `Phase0GuardianProfile`, with two coercions:
  //   - `MockGuardianTitle` is a free string in the mock (e.g. "Mr",
  //     "Ms", "Dr", "Adv.") → we pass it through as the wire shape's
  //     enum and let unknown values fall back to "Undisclosed".
  //   - `MockGuardianIdType` is "RSA ID" / "Passport" / null → we map
  //     to the canonical "RsaId" / "Passport" / "Undisclosed" enum.
  const mp = p.profile;
  // The mock title vocabulary has "Miss" / no "Mx"; the wire has "Mx" /
  // no "Miss". Fold "Miss" → "Ms" (closest semantic match) so vetting
  // still shows a meaningful salutation; everything else round-trips.
  const titleMap: Record<string, Phase0GuardianTitle> = {
    Mr: 'Mr',
    Mrs: 'Mrs',
    Ms: 'Ms',
    Miss: 'Ms',
    Dr: 'Dr',
    Prof: 'Prof',
    Undisclosed: 'Undisclosed',
  };
  // "Other" on the mock collapses to "Undisclosed" — the wire only
  // distinguishes the two recognised types and that's intentional
  // (institutions need to know whether they're looking at an RSA ID or
  // a foreign passport for compliance, not the catch-all).
  const idMap: Record<string, Phase0GuardianIdType> = {
    'RSA ID': 'RsaId',
    Passport: 'Passport',
    Other: 'Undisclosed',
  };
  const profile: Phase0GuardianProfile = mp
    ? {
        title: (mp.title && titleMap[mp.title]) ?? 'Undisclosed',
        firstName: mp.firstName ?? null,
        lastName: mp.lastName ?? null,
        idType: (mp.idNumberType && idMap[mp.idNumberType]) ?? 'Undisclosed',
        idNumber: mp.idNumber ?? null,
        mobile: mp.mobile ?? null,
        telephone: mp.telephone ?? null,
        financialEmail: mp.financialEmail ?? null,
      }
    : { ...EMPTY_PHASE0_GUARDIAN_PROFILE };
  return {
    id: p.id,
    displayName: p.displayName,
    email: p.email,
    phone: p.phone,
    profile,
    createdAt: p.createdAt,
    children: p.children.map(childToDto),
  };
}

/**
 * Coerce a Phase0 wire-shaped profile into the mock seed shape. The
 * two are identical except the mock allows `null` for gender (legacy
 * seeds), whereas the wire always carries an explicit `Undisclosed`.
 */
function mockProfileFromPhase0(p: Phase0ChildProfile): MockChildProfile {
  const gender: MockChildGender = p.gender;
  return {
    firstName: p.firstName?.trim() || null,
    lastName: p.lastName?.trim() || null,
    gender,
    hasEpilepsyHistory: p.hasEpilepsyHistory,
    allowSocialMediaSharing: p.allowSocialMediaSharing,
    ailmentsAllergiesConditions:
      p.ailmentsAllergiesConditions?.trim() || null,
  };
}

function childToDto(c: MockParentChild): Phase0ParentChild {
  // Mock seeds ship a partial profile (and some legacy seeds none at
  // all). Map what's there and backfill the rest with the empty
  // profile so the SPA can rely on `profile` always being present.
  const mp = c.profile;
  return {
    id: c.id,
    displayName: c.displayName,
    dateOfBirth: c.dateOfBirth,
    notes: c.notes,
    photoUrl: c.photoUrl ?? null,
    profile: mp
      ? {
          firstName: mp.firstName ?? null,
          lastName: mp.lastName ?? null,
          gender: mp.gender ?? 'Undisclosed',
          hasEpilepsyHistory: mp.hasEpilepsyHistory ?? null,
          allowSocialMediaSharing: mp.allowSocialMediaSharing ?? null,
          ailmentsAllergiesConditions: mp.ailmentsAllergiesConditions ?? null,
        }
      : { ...EMPTY_PHASE0_CHILD_PROFILE },
  };
}

function validateOnboard(body: Phase0OnboardParentRequest): string | null {
  if (!body.displayName?.trim()) return 'Display name is required.';
  if (!body.email?.trim()) return 'Email is required.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email.trim()))
    return 'Email looks invalid.';
  for (const c of body.children ?? []) {
    if (!c.displayName?.trim())
      return 'Each onboarding child requires a name.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.dateOfBirth))
      return 'Each onboarding child needs a YYYY-MM-DD date of birth.';
  }
  return null;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Project the live-mode wire response into the
 * `Map<partnerId, PreferredEndorsement>` shape the directory UI
 * already understands. Lives in the bridge (not the API service) so
 * the wire types stay close to the controller and the domain shape
 * stays reusable across mock + live without a circular dependency.
 *
 * Defensive on the wire payload: empty / missing fields skip the row
 * rather than rendering a partial card. Curators with no name are
 * filtered too — a "Preferred by ?" pill would be a worse experience
 * than no pill at all.
 */
function preferredPartnersFromWire(
  items: WirePreferredPartner[],
): Map<string, PreferredEndorsement> {
  const map = new Map<string, PreferredEndorsement>();
  for (const w of items ?? []) {
    if (!w?.partnerInstitutionId || !w.partnerName) continue;
    const curators = (w.curators ?? [])
      .filter((c): c is WireEndorsingCurator => !!c?.institutionId && !!c.name)
      .map<EndorsementInstitution>((c) => ({
        id: c.institutionId,
        name: c.name,
        accentColor: c.accentColor ?? null,
      }));
    if (curators.length === 0) continue;
    map.set(w.partnerInstitutionId, {
      partner: {
        id: w.partnerInstitutionId,
        name: w.partnerName,
        accentColor: w.partnerAccentColor ?? null,
      },
      curators,
    });
  }
  return map;
}
