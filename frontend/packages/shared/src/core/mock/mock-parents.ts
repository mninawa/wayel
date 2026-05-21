/**
 * In-memory parent table mirroring `tools/platform-mock-api/server.mjs`.
 *
 * The parent record owns the canonical child identity (`pchild_*`) and the
 * child's full lifetime of **subscription periods** per institution. Each
 * subscription period is immutable once `endedAt` is set; new enrolments at
 * the same institution create a fresh period rather than mutating the prior
 * one. This is what makes a child's history portable across institutions and
 * archivable back to the parent at the end of every cycle.
 *
 * Cross-institution data on an institution-side child detail is computed by
 * walking back from the institution-side child → `parentChildId` → this
 * table → its periods.
 *
 * Note: this is a mutable singleton in mock mode. The bridge services (parents,
 * subscription-requests, children) all read/write here so the simulator and
 * inbox stay coherent within a single page session.
 */

import type { Phase0ChildLifetimeEventKind } from '../contracts/children.phase0';

/**
 * One event on a subscription period's lifetime timeline. Mirrors
 * `Phase0ChildLifetimeEvent`.
 */
export interface MockParentChildSubscriptionEvent {
  id: string;
  /** ISO 8601 timestamp. */
  occurredAt: string;
  kind: Phase0ChildLifetimeEventKind;
  summary: string;
  details: Record<string, unknown> | null;
  actorEmail: string | null;
  actorName: string | null;
}

/**
 * One enrolment cycle at one institution. Periods are owned by the child
 * (parent-child) and are immutable once `endedAt` is set.
 */
export interface MockParentChildSubscription {
  /** Stable id of this subscription period (e.g. `pcs_*`). */
  id: string;
  /**
   * Live API subscription-period GUID when the workspace pulled this row
   * from `GET /children/{id}` (mock periods use synthetic `pcs_*` ids only).
   */
  subscriptionPeriodId?: string | null;
  institutionId: string;
  /** Set when the period materialised an institution-side child row. */
  institutionChildId?: string;
  state: 'pending' | 'active' | 'paused' | 'ended';
  /** ISO 8601 date (YYYY-MM-DD), null while pending. */
  enrolledAt: string | null;
  /** ISO 8601 date (YYYY-MM-DD), null while still open. */
  endedAt: string | null;
  /** Reason captured when the period was ended. */
  endedReason: string | null;
  /** ISO 8601 timestamp the parent archived this period. */
  archivedAt: string | null;
  classroom: string | null;
  /** Chronological events on this period (ascending). */
  events: MockParentChildSubscriptionEvent[];
}

export interface MockMemory {
  id: string; // mem_*
  kind: 'photo' | 'video';
  url: string;
  caption: string | null;
  /** ISO date (YYYY-MM-DD) of when the memory happened. */
  occurredAt: string;
  /** ISO datetime stamp of upload time. */
  createdAt: string;
  tag: string | null;
  institutionId: string | null;
}

export type MockChildGender = 'Male' | 'Female' | 'Other' | 'Undisclosed';

/**
 * Extended child profile shown on the pre-approval drawer (gender, split
 * name, consent flags, ailments). All fields are optional — the drawer
 * renders a `—` placeholder when one is missing.
 */
export interface MockChildProfile {
  /** Split first name (display fallback derived from `displayName`). */
  firstName: string | null;
  /** Split last name (display fallback derived from `displayName`). */
  lastName: string | null;
  gender: MockChildGender | null;
  /** Has the parent disclosed any history of epilepsy? */
  hasEpilepsyHistory: boolean | null;
  /**
   * Did the parent grant consent to share photos of the child on social
   * media (e.g. for marketing)?
   */
  allowSocialMediaSharing: boolean | null;
  /**
   * Free-form ailments / allergies / conditions the centre should be
   * aware of. Distinct from the general `notes` field (left to staff).
   */
  ailmentsAllergiesConditions: string | null;
}

export interface MockParentChild {
  id: string; // pchild_*
  displayName: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  dateOfBirth: string;
  notes: string | null;
  /** `data:` URL or absolute URL. Null = render initials avatar. */
  photoUrl: string | null;
  /**
   * Optional extended child profile (split name, gender, consent flags,
   * ailments). Undefined for legacy seeds. The drawer falls back to the
   * `displayName` and shows '—' for missing fields.
   */
  profile?: MockChildProfile;
  subscriptions: MockParentChildSubscription[];
  /** Standalone memories not attached to any daily report. Optional for legacy seeds. */
  memories?: MockMemory[];
}

export type MockGuardianTitle =
  | 'Mr'
  | 'Mrs'
  | 'Ms'
  | 'Miss'
  | 'Dr'
  | 'Prof'
  | 'Undisclosed';

export type MockGuardianIdType = 'RSA ID' | 'Passport' | 'Other';

/**
 * Extended guardian profile shown on the parent-profile drawer staff use to
 * vet a subscription request before approving. All fields are optional so
 * legacy seeds (and live records mid-backfill) keep loading — the drawer
 * renders a `—` placeholder when a field is missing.
 */
export interface MockGuardianProfile {
  title: MockGuardianTitle | null;
  firstName: string | null;
  lastName: string | null;
  idNumberType: MockGuardianIdType | null;
  idNumber: string | null;
  mobile: string | null;
  telephone: string | null;
  /**
   * Where finance documents (invoices, receipts, statements) are sent.
   * When null the platform falls back to the primary `email`.
   */
  financialEmail: string | null;
}

export interface MockParent {
  id: string; // parent_*
  displayName: string;
  email: string;
  phone: string | null;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /**
   * Optional extended guardian profile (title, ID, mobile/telephone split,
   * financial email). Undefined for legacy seeds. The drawer fills with
   * '—' when a field is missing.
   */
  profile?: MockGuardianProfile;
  children: MockParentChild[];
}

let pcsCounter = 0;
let evCounter = 0;
function pcsId(slug: string): string {
  return `pcs_${slug}_${(++pcsCounter).toString(36)}`;
}
function evId(prefix: string): string {
  return `ev_${prefix}_${(++evCounter).toString(36)}`;
}

/**
 * Convenience for building a single event. Keeps the seed data readable.
 */
function ev(
  occurredAt: string,
  kind: Phase0ChildLifetimeEventKind,
  summary: string,
  details: Record<string, unknown> | null = null,
  actor:
    | { email: string; name: string | null }
    | { email: null; name: null } = { email: 'admin@littlestars.edu', name: 'Admin' },
): MockParentChildSubscriptionEvent {
  return {
    id: evId(kind),
    occurredAt,
    kind,
    summary,
    details,
    actorEmail: actor.email,
    actorName: actor.name,
  };
}

/**
 * Synthesise a basic event timeline for a "live" period that is currently
 * open (pending / active / paused). Just an enrolment marker so the UI never
 * shows a period with zero events.
 */
function openPeriodEvents(
  enrolledAt: string | null,
  classroom: string | null,
): MockParentChildSubscriptionEvent[] {
  if (!enrolledAt) return [];
  return [
    ev(`${enrolledAt}T08:00:00Z`, 'enrolled', `Enrolled${classroom ? ` in ${classroom}` : ''}.`, {
      classroom,
    }),
  ];
}

export const MOCK_PARENTS: MockParent[] = [
  {
    id: 'parent_thandi',
    displayName: 'Thandi Mavuso',
    email: 'thandi.mavuso@example.com',
    phone: '+27 11 555 0100',
    createdAt: '2021-02-01T08:00:00Z',
    profile: {
      title: 'Mrs',
      firstName: 'Thandi',
      lastName: 'Mavuso',
      idNumberType: 'RSA ID',
      idNumber: '8504215404081',
      mobile: '+27 82 555 0100',
      telephone: '+27 11 555 0100',
      financialEmail: 'thandi.mavuso@example.com',
    },
    children: [
      {
        id: 'pchild_azifani',
        displayName: 'Azifani Mavuso',
        dateOfBirth: '2021-03-12',
        notes: 'No known allergies. Carries an asthma pump.',
        profile: {
          firstName: 'Azifani',
          lastName: 'Mavuso',
          gender: 'Male',
          hasEpilepsyHistory: false,
          allowSocialMediaSharing: true,
          ailmentsAllergiesConditions:
            'Mild asthma — carries a blue inhaler. No food allergies.',
        },
        photoUrl:
          'https://api.dicebear.com/7.x/adventurer/svg?seed=Azifani&backgroundColor=b6e3f4',
        memories: [
          {
            id: 'mem_azi_birthday3',
            kind: 'photo',
            url: 'https://picsum.photos/seed/azifani-birthday-3/720/720',
            caption: '3rd birthday — chose his own outfit. Big day.',
            occurredAt: '2024-03-12',
            createdAt: '2024-03-12T18:30:00Z',
            tag: 'Birthday',
            institutionId: null,
          },
          {
            id: 'mem_azi_first_swim_lesson',
            kind: 'photo',
            url: 'https://picsum.photos/seed/azifani-first-swim/720/720',
            caption: 'First lesson at Aqua Stars — he wasn\'t scared at all.',
            occurredAt: '2024-09-04',
            createdAt: '2024-09-04T17:10:00Z',
            tag: 'First time',
            institutionId: 'inst_aqua_stars',
          },
        ],
        // A real 5-year lifetime: born 2021, currently age 5. Started in
        // playgroup at 6 months, moved through multiple institutions, and
        // is currently active at Little Stars + Aqua Stars.
        subscriptions: [
          // Year 1 (2021): playgroup at Little Stars. Ended when family
          // relocated to follow a job.
          {
            id: pcsId('azi_ls_2021'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_001',
            state: 'ended',
            enrolledAt: '2021-09-01',
            endedAt: '2022-06-30',
            endedReason: 'Family relocated for a year.',
            archivedAt: '2022-07-15T10:00:00Z',
            classroom: 'Buttercups (0-1 yr)',
            events: [
              ev('2021-08-25T09:00:00Z', 'enrolled', 'Enrolled in Buttercups (0-1 yr).', {
                classroom: 'Buttercups (0-1 yr)',
              }),
              ev('2021-12-10T10:00:00Z', 'milestone', 'First steps observed at school.', {
                note: 'Walked 4 steps unassisted to teacher.',
              }),
              ev(
                '2022-04-22T09:30:00Z',
                'skill_earned',
                'Recognises own name when called.',
                {
                  skillName: 'Recognises own name',
                  programName: 'Buttercups — Term 2 2022',
                  instructorEmail: 'thandi@example.com',
                  instructorName: 'Thandi Mokoena',
                },
              ),
              ev('2022-06-30T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Family relocated for a year.',
              }),
            ],
          },
          // Year 2 (2022-2023): nursery at a sibling institution while away.
          {
            id: pcsId('azi_kc_2022'),
            institutionId: 'inst_brushstrokes',
            state: 'ended',
            enrolledAt: '2022-08-01',
            endedAt: '2023-07-15',
            endedReason: 'Returned home — re-enrolled at Little Stars.',
            archivedAt: '2023-07-30T08:00:00Z',
            classroom: 'Mini Makers',
            events: [
              ev(
                '2022-08-01T08:00:00Z',
                'enrolled',
                'Enrolled in Mini Makers.',
                { classroom: 'Mini Makers' },
                { email: 'lead@brushstrokes.example', name: 'Brushstrokes Lead' },
              ),
              ev(
                '2023-03-04T11:00:00Z',
                'skill_earned',
                'Holds a crayon with pincer grip.',
                {
                  skillName: 'Pincer grip on crayon',
                  programName: 'Mini Makers — Term 1 2023',
                  instructorEmail: 'lead@brushstrokes.example',
                  instructorName: 'Brushstrokes Lead',
                },
              ),
              ev('2023-07-15T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Returned home — re-enrolled at Little Stars.',
              }),
            ],
          },
          // Year 3 (2023-2024): back at Little Stars — first re-enrolment.
          // Note: this is a NEW period at the same institution; the 2021
          // period above is preserved verbatim.
          {
            id: pcsId('azi_ls_2023'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_001',
            state: 'ended',
            enrolledAt: '2023-08-01',
            endedAt: '2024-01-14',
            endedReason: 'Promoted to next age group on schedule.',
            archivedAt: '2024-01-30T08:00:00Z',
            classroom: 'Daisies (2-3 yrs)',
            events: [
              ev('2023-08-01T08:00:00Z', 'enrolled', 'Re-enrolled in Daisies (2-3 yrs).', {
                classroom: 'Daisies (2-3 yrs)',
              }),
              ev(
                '2023-11-15T10:00:00Z',
                'skill_earned',
                'Counts to 5 unaided.',
                {
                  skillName: 'Counts to 5 unaided',
                  programName: 'Daisies — Term 4 2023',
                  instructorEmail: 'thandi@example.com',
                  instructorName: 'Thandi Mokoena',
                },
              ),
              ev('2024-01-14T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Promoted to next age group on schedule.',
              }),
            ],
          },
          // Year 4 (2024-current): Sunflowers at Little Stars — currently
          // active. This is the period the institution staff are actively
          // managing; everything they do (skills, state changes) lands here.
          {
            id: pcsId('azi_ls_2024'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_001',
            state: 'active',
            enrolledAt: '2024-01-15',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Sunflowers (3-4 yrs)',
            events: [
              ev('2024-01-15T08:00:00Z', 'enrolled', 'Enrolled in Sunflowers (3-4 yrs).', {
                classroom: 'Sunflowers (3-4 yrs)',
              }),
              ev(
                '2024-02-20T10:30:00Z',
                'skill_earned',
                'Recognises own name in writing.',
                {
                  skillName: 'Recognises own name',
                  programName: 'Sunflowers — Term 1 2024',
                  instructorEmail: 'thandi@example.com',
                  instructorName: 'Thandi Mokoena',
                },
              ),
              ev(
                '2024-05-14T10:30:00Z',
                'skill_earned',
                'Counts to 10 unaided.',
                {
                  skillName: 'Counts to 10 unaided',
                  programName: 'Sunflowers — Term 2 2024',
                  instructorEmail: 'thandi@example.com',
                  instructorName: 'Thandi Mokoena',
                },
              ),
              ev(
                '2024-09-02T10:00:00Z',
                'skill_earned',
                'Tying shoelaces.',
                {
                  skillName: 'Tying shoelaces',
                  programName: 'Daily Living Skills — Term 3 2024',
                  instructorEmail: 'sipho@example.com',
                  instructorName: 'Sipho Dlamini',
                },
              ),
            ],
          },
          // Year 4 also: parallel subscription at a swim school (still open).
          {
            id: pcsId('azi_aq_2024'),
            institutionId: 'inst_aqua_stars',
            state: 'active',
            enrolledAt: '2024-04-08',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Beginner Swim',
            events: [
              ev(
                '2024-04-08T08:00:00Z',
                'enrolled',
                'Enrolled in Beginner Swim.',
                { classroom: 'Beginner Swim' },
                { email: 'coach@aquastars.example', name: 'Coach' },
              ),
              ev(
                '2024-06-22T11:00:00Z',
                'skill_earned',
                'Front crawl: 25m.',
                {
                  skillName: 'Front crawl: 25m',
                  programName: 'Beginner Swim — Term 2 2024',
                  instructorEmail: 'coach@aquastars.example',
                  instructorName: 'Coach',
                },
                { email: 'coach@aquastars.example', name: 'Coach' },
              ),
            ],
          },
        ],
      },
      // Younger sibling — toddler at the art studio. Used to make the parent
      // children grid show a multi-child layout (avatar + name only) and to
      // give the detail page a shorter, single-active-period timeline.
      {
        id: 'pchild_simi',
        displayName: 'Simi Mavuso',
        dateOfBirth: '2023-07-04',
        notes: 'Lactose intolerant. Loves singing.',
        profile: {
          firstName: 'Simi',
          lastName: 'Mavuso',
          gender: 'Female',
          hasEpilepsyHistory: false,
          allowSocialMediaSharing: true,
          ailmentsAllergiesConditions:
            'Lactose intolerant — please avoid dairy at snack time.',
        },
        photoUrl:
          'https://api.dicebear.com/7.x/adventurer/svg?seed=Simi&backgroundColor=ffd5dc',
        subscriptions: [
          {
            id: pcsId('simi_bs_2025'),
            institutionId: 'inst_brushstrokes',
            state: 'active',
            enrolledAt: '2025-02-03',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Tiny Picassos',
            events: [
              ev(
                '2025-02-03T08:00:00Z',
                'enrolled',
                'Enrolled in Tiny Picassos.',
                { classroom: 'Tiny Picassos' },
                { email: 'lead@brushstrokes.example', name: 'Brushstrokes Lead' },
              ),
              ev(
                '2025-05-12T10:00:00Z',
                'milestone',
                'First finger-paint masterpiece.',
                { note: 'Used three colours independently.' },
                { email: 'lead@brushstrokes.example', name: 'Brushstrokes Lead' },
              ),
              ev(
                '2026-01-21T10:30:00Z',
                'skill_earned',
                'Names primary colours.',
                {
                  skillName: 'Names primary colours',
                  programName: 'Tiny Picassos — Term 1 2026',
                  instructorEmail: 'lead@brushstrokes.example',
                  instructorName: 'Brushstrokes Lead',
                },
                { email: 'lead@brushstrokes.example', name: 'Brushstrokes Lead' },
              ),
            ],
          },
        ],
      },
      // Older sibling — long-running karate dojo subscription with a sealed
      // prior year, so the detail page can show both an archived period and
      // a live one (multiple periods, multiple states).
      {
        id: 'pchild_kabelo',
        displayName: 'Kabelo Mavuso',
        dateOfBirth: '2017-10-19',
        notes: 'Wears glasses for reading.',
        profile: {
          firstName: 'Kabelo',
          lastName: 'Mavuso',
          gender: 'Male',
          hasEpilepsyHistory: false,
          allowSocialMediaSharing: false,
          ailmentsAllergiesConditions:
            'Wears glasses for reading — keeps a spare pair in the bag.',
        },
        photoUrl:
          'https://api.dicebear.com/7.x/adventurer/svg?seed=Kabelo&backgroundColor=c0aede',
        subscriptions: [
          {
            id: pcsId('kab_kk_2023'),
            institutionId: 'inst_kintaro_karate',
            state: 'ended',
            enrolledAt: '2023-02-06',
            endedAt: '2024-12-15',
            endedReason: 'Promoted to next belt group.',
            archivedAt: '2025-01-05T08:00:00Z',
            classroom: 'White Belts',
            events: [
              ev(
                '2023-02-06T08:00:00Z',
                'enrolled',
                'Enrolled in White Belts.',
                { classroom: 'White Belts' },
                { email: 'sensei@kintaro.example', name: 'Sensei Kintaro' },
              ),
              ev(
                '2024-03-09T11:00:00Z',
                'skill_earned',
                'Earned yellow belt.',
                {
                  skillName: 'Yellow belt',
                  programName: 'White Belts — Spring 2024',
                  instructorEmail: 'sensei@kintaro.example',
                  instructorName: 'Sensei Kintaro',
                },
                { email: 'sensei@kintaro.example', name: 'Sensei Kintaro' },
              ),
              ev('2024-12-15T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Promoted to next belt group.',
              }),
            ],
          },
          {
            id: pcsId('kab_kk_2025'),
            institutionId: 'inst_kintaro_karate',
            state: 'active',
            enrolledAt: '2025-01-20',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Orange Belts',
            events: [
              ev(
                '2025-01-20T08:00:00Z',
                'enrolled',
                'Enrolled in Orange Belts.',
                { classroom: 'Orange Belts' },
                { email: 'sensei@kintaro.example', name: 'Sensei Kintaro' },
              ),
              ev(
                '2026-02-14T11:00:00Z',
                'milestone',
                'Won bronze at regional kata.',
                { note: 'First competition medal.' },
                { email: 'sensei@kintaro.example', name: 'Sensei Kintaro' },
              ),
            ],
          },
          // Music — running through most of the trend window so weekly trends
          // can blend reports from multiple institutions.
          {
            id: pcsId('kab_son_2025'),
            institutionId: 'inst_sonata_music',
            state: 'active',
            enrolledAt: '2025-04-08',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Junior Strings',
            events: [
              ev(
                '2025-04-08T08:00:00Z',
                'enrolled',
                'Enrolled in Junior Strings.',
                { classroom: 'Junior Strings' },
                { email: 'maestro@sonata.example', name: 'Maestro Sonata' },
              ),
              ev(
                '2025-11-03T15:00:00Z',
                'skill_earned',
                'Passed Grade 1 violin theory.',
                { skillName: 'Grade 1 violin theory' },
                { email: 'maestro@sonata.example', name: 'Maestro Sonata' },
              ),
              ev(
                '2026-03-22T18:00:00Z',
                'milestone',
                'First solo at term recital.',
                { note: 'Performed Twinkle, Twinkle in front of parents.' },
                { email: 'maestro@sonata.example', name: 'Maestro Sonata' },
              ),
            ],
          },
          // Swim — provides a weekend-heavy subscription so daily reports
          // distribute across the week instead of just weekdays.
          {
            id: pcsId('kab_aqua_2025'),
            institutionId: 'inst_aqua_stars',
            state: 'active',
            enrolledAt: '2025-06-14',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Sharks (7-9 yrs)',
            events: [
              ev(
                '2025-06-14T08:00:00Z',
                'enrolled',
                'Enrolled in Sharks (7-9 yrs).',
                { classroom: 'Sharks (7-9 yrs)' },
                { email: 'coach@aquastars.example', name: 'Coach Aqua' },
              ),
              ev(
                '2025-09-27T10:30:00Z',
                'skill_earned',
                'Earned 25m freestyle badge.',
                { skillName: '25m freestyle' },
                { email: 'coach@aquastars.example', name: 'Coach Aqua' },
              ),
              ev(
                '2026-01-10T10:30:00Z',
                'skill_earned',
                'Earned 25m backstroke badge.',
                { skillName: '25m backstroke' },
                { email: 'coach@aquastars.example', name: 'Coach Aqua' },
              ),
            ],
          },
          // Aftercare — daycare-kind subscription Mon-Fri afternoons. Provides
          // the rich meals/sleep/hygiene signal for the trends Meals card so
          // it isn't entirely empty for an older child whose other subs are
          // all short-class sessions.
          {
            id: pcsId('kab_ls_aftercare'),
            institutionId: 'tenant_little_stars',
            state: 'active',
            enrolledAt: '2025-04-14',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Aftercare (5-9 yrs)',
            events: [
              ev(
                '2025-04-14T15:00:00Z',
                'enrolled',
                'Enrolled in Aftercare (5-9 yrs).',
                { classroom: 'Aftercare (5-9 yrs)' },
                { email: 'jane@littlestars.test', name: 'Jane Naidoo' },
              ),
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'parent_mei',
    displayName: 'Mei Chen',
    email: 'mei.chen@example.com',
    phone: '+27 11 555 0123',
    profile: {
      title: 'Ms',
      firstName: 'Mei',
      lastName: 'Chen',
      idNumberType: 'Passport',
      idNumber: 'CN9234812',
      mobile: '+27 83 555 0123',
      telephone: '+27 11 555 0123',
      financialEmail: 'finance@chenfamily.example',
    },
    createdAt: '2024-02-14T08:00:00Z',
    children: [
      {
        id: 'pchild_liam',
        displayName: 'Liam Chen',
        dateOfBirth: '2020-11-02',
        notes: 'Vegetarian. Peanut allergy.',
        photoUrl: null,
        profile: {
          firstName: 'Liam',
          lastName: 'Chen',
          gender: 'Male',
          hasEpilepsyHistory: false,
          allowSocialMediaSharing: true,
          ailmentsAllergiesConditions:
            'Severe peanut allergy — EpiPen kept in the office. Vegetarian diet (no meat or fish).',
        },
        subscriptions: [
          {
            id: pcsId('liam_ls'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_002',
            state: 'active',
            enrolledAt: '2024-01-22',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Sunflowers (3-4 yrs)',
            events: openPeriodEvents('2024-01-22', 'Sunflowers (3-4 yrs)'),
          },
          {
            id: pcsId('liam_son'),
            institutionId: 'inst_sonata_music',
            state: 'active',
            enrolledAt: '2024-03-01',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Tiny Strings',
            events: openPeriodEvents('2024-03-01', 'Tiny Strings'),
          },
        ],
      },
    ],
  },
  {
    id: 'parent_priya',
    displayName: 'Priya Naidoo',
    email: 'priya.naidoo@example.com',
    phone: null,
    profile: {
      title: 'Ms',
      firstName: 'Priya',
      lastName: 'Naidoo',
      idNumberType: 'RSA ID',
      idNumber: '9008145501083',
      mobile: '+27 84 555 0177',
      telephone: null,
      financialEmail: null,
    },
    createdAt: '2024-04-01T08:00:00Z',
    children: [
      {
        id: 'pchild_zara',
        displayName: 'Zara Naidoo',
        dateOfBirth: '2022-01-20',
        notes: 'Quiet, gentle child — first time in any program.',
        photoUrl: null,
        profile: {
          firstName: 'Zara',
          lastName: 'Naidoo',
          gender: 'Female',
          hasEpilepsyHistory: false,
          allowSocialMediaSharing: false,
          ailmentsAllergiesConditions:
            'No known allergies. Mild eczema — please use unscented hand soap.',
        },
        subscriptions: [
          {
            id: pcsId('zara_ls'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_003',
            state: 'pending',
            enrolledAt: null,
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Sunflowers (3-4 yrs)',
            events: [],
          },
        ],
      },
      {
        id: 'pchild_sahil',
        displayName: 'Sahil Naidoo',
        dateOfBirth: '2019-08-04',
        notes: null,
        photoUrl: null,
        profile: {
          firstName: 'Sahil',
          lastName: 'Naidoo',
          gender: 'Male',
          hasEpilepsyHistory: false,
          allowSocialMediaSharing: false,
          ailmentsAllergiesConditions: null,
        },
        subscriptions: [
          {
            id: pcsId('sahil_kk'),
            institutionId: 'inst_kintaro_karate',
            state: 'active',
            enrolledAt: '2023-06-01',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Little Tigers',
            events: openPeriodEvents('2023-06-01', 'Little Tigers'),
          },
        ],
      },
    ],
  },
  // Parent who hasn't subscribed anywhere yet — handy for the simulator.
  {
    id: 'parent_ada',
    displayName: 'Ada Okonkwo',
    email: 'ada.okonkwo@example.com',
    phone: null,
    profile: {
      title: 'Mrs',
      firstName: 'Ada',
      lastName: 'Okonkwo',
      idNumberType: 'Passport',
      idNumber: 'NG7783201',
      mobile: '+27 82 555 0210',
      telephone: '+27 11 555 0210',
      financialEmail: 'ada.okonkwo@example.com',
    },
    createdAt: '2026-04-15T08:00:00Z',
    children: [
      {
        id: 'pchild_jamal',
        displayName: 'Jamal Okonkwo',
        dateOfBirth: '2020-11-22',
        notes: null,
        photoUrl: null,
        profile: {
          firstName: 'Jamal',
          lastName: 'Okonkwo',
          gender: 'Male',
          hasEpilepsyHistory: true,
          allowSocialMediaSharing: false,
          ailmentsAllergiesConditions:
            'History of febrile seizures (last episode 2024). Carries levetiracetam — please contact mom immediately if a seizure occurs.',
        },
        subscriptions: [],
      },
      {
        id: 'pchild_chika',
        displayName: 'Chika Okonkwo',
        dateOfBirth: '2022-06-04',
        notes: null,
        photoUrl: null,
        profile: {
          firstName: 'Chika',
          lastName: 'Okonkwo',
          gender: 'Female',
          hasEpilepsyHistory: false,
          allowSocialMediaSharing: false,
          ailmentsAllergiesConditions: null,
        },
        subscriptions: [],
      },
    ],
  },
];

/** Look up a parent-child by id across the whole table. */
export function findMockParentChild(
  parentChildId: string,
): { parent: MockParent; child: MockParentChild } | null {
  for (const p of MOCK_PARENTS) {
    const c = p.children.find((x) => x.id === parentChildId);
    if (c) return { parent: p, child: c };
  }
  return null;
}

/** Look up a parent-child by an institution-side child id (reverse lookup). */
export function findMockParentChildByInstitutionChildId(
  institutionChildId: string,
): {
  parent: MockParent;
  child: MockParentChild;
  subscription: MockParentChildSubscription;
} | null {
  for (const p of MOCK_PARENTS) {
    for (const c of p.children) {
      // Prefer the open period that points at this institutionChildId; fall
      // back to any period (e.g. an already-ended one whose institution-side
      // row is still being viewed in archive).
      const open = c.subscriptions.find(
        (s) => s.institutionChildId === institutionChildId && s.state !== 'ended',
      );
      if (open) return { parent: p, child: c, subscription: open };
      const any = c.subscriptions.find(
        (s) => s.institutionChildId === institutionChildId,
      );
      if (any) return { parent: p, child: c, subscription: any };
    }
  }
  return null;
}

/**
 * Find the period at a given institution that is "open" (pending / active /
 * paused). Returns null if the most recent period there is ended (or none
 * exists), in which case callers should create a new period rather than
 * mutate the prior one.
 */
export function findOpenPeriod(
  parentChild: MockParentChild,
  institutionId: string,
): MockParentChildSubscription | null {
  return (
    parentChild.subscriptions.find(
      (s) => s.institutionId === institutionId && s.state !== 'ended',
    ) ?? null
  );
}

/** Find the latest period (any state) at a given institution. */
export function findLatestPeriod(
  parentChild: MockParentChild,
  institutionId: string,
): MockParentChildSubscription | null {
  const here = parentChild.subscriptions.filter(
    (s) => s.institutionId === institutionId,
  );
  if (!here.length) return null;
  return here.reduce((newest, p) => {
    const pStart = p.enrolledAt ?? p.events[0]?.occurredAt ?? '';
    const nStart = newest.enrolledAt ?? newest.events[0]?.occurredAt ?? '';
    return pStart > nStart ? p : newest;
  });
}

/**
 * Append a single event to an open period. No-op (and warns in dev) when the
 * period is already ended — this enforces the "ended periods are immutable"
 * invariant.
 */
export function appendPeriodEvent(
  period: MockParentChildSubscription,
  event: MockParentChildSubscriptionEvent,
): void {
  if (period.state === 'ended') {
    if (typeof console !== 'undefined') {
      console.warn(
        `[mock-parents] refusing to append event to ended period ${period.id}`,
      );
    }
    return;
  }
  period.events.push(event);
}

/** Stable id generators exposed for the bridges. */
export function nextMockSubscriptionPeriodId(slug: string): string {
  return pcsId(slug);
}
export function nextMockEventId(prefix: string): string {
  return evId(prefix);
}
