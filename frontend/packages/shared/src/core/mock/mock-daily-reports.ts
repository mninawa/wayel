/**
 * In-memory store for daily reports, mirroring `tools/platform-mock-api/server.mjs`.
 *
 * Reports reference children by `parentChildId` (the parent's canonical
 * identity), not by the per-institution `child_*` record. This is deliberate:
 * the report belongs to the *child's* lifetime, and follows them across
 * institutions and across age groups.
 *
 * Bridge services read/write this list directly in mock mode so the parent
 * surface and both staff surfaces stay coherent within a session.
 */

import type {
  Phase0DailyReportDrinks,
  Phase0DailyReportHygiene,
  Phase0DailyReportKind,
  Phase0DailyReportMeals,
  Phase0DailyReportMedia,
  Phase0DailyReportMood,
  Phase0DailyReportSleep,
  Phase0DailyReportStatus,
  Phase0MealPortion,
  Phase0SessionAttendance,
  Phase0SessionDetails,
  Phase0SessionEffort,
} from '../contracts/daily-reports.phase0';
import { institutionKindOf } from './mock-institutions';

export interface MockDailyReport {
  id: string;
  parentChildId: string;
  parentId: string;
  institutionId: string;
  programId: string | null;
  /** Whether this report is full-day care (`'daycare'`) or a short class (`'session'`). */
  reportKind: Phase0DailyReportKind;
  reportDate: string; // YYYY-MM-DD
  status: Phase0DailyReportStatus;
  /** ISO 8601 timestamp of the most recent save. */
  postedAt: string;
  /** ISO 8601 timestamp of the first publish, or null while still a draft. */
  publishedAt: string | null;
  authorEmail: string;
  authorName: string;
  mood: Phase0DailyReportMood | null;
  /** Daycare-only block; null on `'session'` reports. */
  meals: Phase0DailyReportMeals | null;
  /** Daycare-only block; null on `'session'` reports. */
  drinks: Phase0DailyReportDrinks | null;
  /** Daycare-only block; null on `'session'` reports. */
  sleep: Phase0DailyReportSleep | null;
  /** Daycare-only block; null on `'session'` reports. */
  hygiene: Phase0DailyReportHygiene | null;
  /** Session-only block; null on `'daycare'` reports. */
  session: Phase0SessionDetails | null;
  summary: string;
  highlights: string | null;
  concerns: string | null;
  media: Phase0DailyReportMedia[];
}

/** Defaults used when a draft hasn't filled in the structured fields yet. */
export const EMPTY_MEALS: Phase0DailyReportMeals = {
  breakfast: null,
  snack: null,
  lunch: null,
};
export const EMPTY_DRINKS: Phase0DailyReportDrinks = {
  water: false,
  bottlesCount: 0,
};
export const EMPTY_SLEEP: Phase0DailyReportSleep = {
  noSleep: false,
  napStart: null,
  napEnd: null,
  napQuality: null,
};
export const EMPTY_HYGIENE: Phase0DailyReportHygiene = {
  pottyTraining: false,
  diaperChanges: null,
  notes: null,
};

/**
 * Seeded reports — all from Jane Naidoo at Little Stars, against children
 * who are currently active there. Mix of mood/highlights/concerns shapes so
 * the parent feed isn't visually flat. Includes one draft to prove the
 * parent-only-sees-published rule.
 */
export const MOCK_DAILY_REPORTS: MockDailyReport[] = [
  {
    id: 'dr_seed_001',
    parentChildId: 'pchild_azifani',
    parentId: 'parent_thandi',
    institutionId: 'tenant_little_stars',
    programId: 'prog_1',
    reportKind: 'daycare',
    reportDate: '2026-04-15',
    status: 'published',
    postedAt: '2026-04-15T15:42:00Z',
    publishedAt: '2026-04-15T15:42:00Z',
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    mood: 'happy',
    meals: { breakfast: 'all', snack: 'all', lunch: 'all' },
    drinks: { water: true, bottlesCount: 1 },
    sleep: {
      noSleep: false,
      napStart: '12:00',
      napEnd: '13:30',
      napQuality: 'well',
    },
    hygiene: {
      pottyTraining: true,
      diaperChanges: 0,
      notes: null,
    },
    session: null,
    summary:
      'Great morning at circle time — Azifani led the weather song today and got everyone clapping along. After lunch we did finger-painting; her butterfly is on the noticeboard.',
    highlights: 'First time leading the morning song!',
    concerns: null,
    media: [
      {
        id: 'm_seed_001_a',
        kind: 'photo',
        url: 'https://picsum.photos/seed/azifani-circle/640/640',
        caption: 'Leading the weather song',
      },
      {
        id: 'm_seed_001_b',
        kind: 'photo',
        url: 'https://picsum.photos/seed/azifani-butterfly/640/640',
        caption: 'Finger-painted butterfly',
      },
    ],
  },
  {
    id: 'dr_seed_002',
    parentChildId: 'pchild_azifani',
    parentId: 'parent_thandi',
    institutionId: 'tenant_little_stars',
    programId: 'prog_1',
    reportKind: 'daycare',
    reportDate: '2026-04-16',
    status: 'published',
    postedAt: '2026-04-16T16:05:00Z',
    publishedAt: '2026-04-16T16:05:00Z',
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    mood: 'okay',
    meals: { breakfast: 'some', snack: 'all', lunch: 'all' },
    drinks: { water: true, bottlesCount: 2 },
    sleep: {
      noSleep: false,
      napStart: '12:00',
      napEnd: '13:00',
      napQuality: 'restless',
    },
    hygiene: {
      pottyTraining: true,
      diaperChanges: 1,
      notes: null,
    },
    session: null,
    summary:
      'Quieter day. Azifani mostly played alongside the others rather than with them. Ate a full lunch and most of her snack.',
    highlights: null,
    concerns:
      'Coughed twice during nap — nothing alarming but worth keeping an eye on at home.',
    media: [
      {
        id: 'm_seed_002_a',
        kind: 'photo',
        url: 'https://picsum.photos/seed/azifani-quiet-day/640/640',
        caption: 'Sandpit on her own — happy enough',
      },
    ],
  },
  {
    id: 'dr_seed_003',
    parentChildId: 'pchild_azifani',
    parentId: 'parent_thandi',
    institutionId: 'tenant_little_stars',
    programId: 'prog_1',
    reportKind: 'daycare',
    reportDate: '2026-04-17',
    status: 'draft',
    postedAt: '2026-04-17T11:20:00Z',
    publishedAt: null,
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    mood: null,
    meals: { breakfast: 'all', snack: null, lunch: null },
    drinks: { water: true, bottlesCount: 0 },
    sleep: {
      noSleep: false,
      napStart: null,
      napEnd: null,
      napQuality: null,
    },
    hygiene: {
      pottyTraining: true,
      diaperChanges: 0,
      notes: null,
    },
    session: null,
    summary:
      'Morning notes only — will fill in the afternoon at pickup time.',
    highlights: null,
    concerns: null,
    media: [],
  },
  {
    id: 'dr_seed_004',
    parentChildId: 'pchild_liam',
    parentId: 'parent_mei',
    institutionId: 'tenant_little_stars',
    programId: 'prog_1',
    reportKind: 'daycare',
    reportDate: '2026-04-16',
    status: 'published',
    postedAt: '2026-04-16T16:10:00Z',
    publishedAt: '2026-04-16T16:10:00Z',
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    mood: 'happy',
    meals: { breakfast: 'all', snack: 'all', lunch: 'all' },
    drinks: { water: true, bottlesCount: 1 },
    sleep: {
      noSleep: false,
      napStart: '12:15',
      napEnd: '13:45',
      napQuality: 'well',
    },
    hygiene: {
      pottyTraining: true,
      diaperChanges: 0,
      notes: null,
    },
    session: null,
    summary:
      'Liam asked to read the dinosaur book three times in a row. He ate his vegetarian lunch (no peanuts in today\'s snack).',
    highlights: 'Counted to twenty unprompted!',
    concerns: null,
    media: [
      {
        id: 'm_seed_004_a',
        kind: 'photo',
        url: 'https://picsum.photos/seed/liam-dinosaur/640/640',
        caption: 'Dinosaur book, take three',
      },
    ],
  },
];

/* -------------------------------------------------------------------------- */
/* Mutators (used by both bridge service and mock server)                     */
/* -------------------------------------------------------------------------- */

export function findReportById(id: string): MockDailyReport | undefined {
  return MOCK_DAILY_REPORTS.find((r) => r.id === id);
}

export function appendReport(report: MockDailyReport): void {
  MOCK_DAILY_REPORTS.push(report);
}

export function patchReport(
  id: string,
  patch: Partial<MockDailyReport>,
): MockDailyReport | undefined {
  const r = findReportById(id);
  if (!r) return undefined;
  Object.assign(r, patch, { postedAt: new Date().toISOString() });
  return r;
}

/** Sort newest first by report date, then by postedAt as a tiebreaker. */
export function sortReportsNewestFirst<T extends { reportDate: string; postedAt: string }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.reportDate !== b.reportDate) return a.reportDate < b.reportDate ? 1 : -1;
    return a.postedAt < b.postedAt ? 1 : -1;
  });
}

/* -------------------------------------------------------------------------- */
/* Synthetic year-long history for `pchild_kabelo`                            */
/*                                                                            */
/*   Drives the Weekly Trends UI on the child detail page. Every entry is    */
/*   deterministically derived from `(date, institution)` so the chart looks  */
/*   identical across reloads, and the "mood dips when sleep is restless"    */
/*   insight surfaces consistently.                                           */
/* -------------------------------------------------------------------------- */

interface KabeloSubBlueprint {
  institutionId: string;
  programId: string | null;
  classroom: string;
  authorEmail: string;
  authorName: string;
  /** Days of week (0=Sun..6=Sat) on which a report is posted. */
  daysOfWeek: ReadonlyArray<number>;
  /** Earliest report date for this subscription (matches enrolment in mock-parents). */
  enrolledAt: string;
  /** Optional contextual snippets to weave into the summary line. */
  vibes: ReadonlyArray<string>;
  /** For session institutions: rotating list of focus areas + per-session skill chips. */
  focusAreas?: ReadonlyArray<string>;
  skillChips?: ReadonlyArray<string>;
}

const KABELO_SUBS: ReadonlyArray<KabeloSubBlueprint> = [
  {
    institutionId: 'inst_kintaro_karate',
    programId: null,
    classroom: 'Orange Belts',
    authorEmail: 'sensei@kintaro.example',
    authorName: 'Sensei Kintaro',
    daysOfWeek: [2, 4],
    enrolledAt: '2025-01-20',
    vibes: ['kata practice', 'pad-work drills', 'sparring rotations', 'belt grading prep'],
    focusAreas: ['Heian Shodan kata', 'Front-kick technique', 'Block combinations', 'Sparring footwork'],
    skillChips: ['kata', 'sparring', 'kicks', 'blocks', 'stances', 'breathing'],
  },
  {
    institutionId: 'inst_sonata_music',
    programId: null,
    classroom: 'Junior Strings',
    authorEmail: 'maestro@sonata.example',
    authorName: 'Maestro Sonata',
    daysOfWeek: [3],
    enrolledAt: '2025-04-08',
    vibes: ['scales workout', 'duet rehearsal', 'note-reading exercises', 'free play with bow'],
    focusAreas: ['G-major scale', 'Twinkle Twinkle Little Star', 'Bow grip basics', 'Duet timing'],
    skillChips: ['scales', 'note reading', 'bowing', 'rhythm', 'pizzicato'],
  },
  {
    institutionId: 'inst_aqua_stars',
    programId: null,
    classroom: 'Sharks (7-9 yrs)',
    authorEmail: 'coach@aquastars.example',
    authorName: 'Coach Aqua',
    daysOfWeek: [6],
    enrolledAt: '2025-06-14',
    vibes: ['endurance set', 'kick-board drills', 'starts and turns', 'free swim cool-down'],
    focusAreas: ['Backstroke kick', 'Freestyle bilateral breathing', 'Tumble turns', 'Streamline push-offs'],
    skillChips: ['floating', 'kick board', 'freestyle', 'backstroke', 'turns', 'breathing'],
  },
  // Aftercare — daycare-kind, runs Mon-Fri after school.
  {
    institutionId: 'tenant_little_stars',
    programId: null,
    classroom: 'Aftercare (5-9 yrs)',
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    daysOfWeek: [1, 2, 3, 4, 5],
    enrolledAt: '2025-04-14',
    vibes: ['homework hour', 'craft table', 'outdoor play', 'reading nook'],
  },
];

const ATTENDANCE_BUCKET: ReadonlyArray<Phase0SessionAttendance> = [
  'present', 'present', 'present', 'present', 'present', 'present',
  'late', 'left_early', 'absent',
];
const EFFORT_BUCKET: ReadonlyArray<Phase0SessionEffort> = [
  'great_effort', 'great_effort', 'on_track', 'on_track', 'on_track', 'needs_push',
];

const TREND_WINDOW_END = '2026-04-17';
const TREND_WINDOW_DAYS = 365;

const MOOD_BUCKET: ReadonlyArray<Phase0DailyReportMood> = [
  'happy', 'happy', 'happy', 'happy',
  'okay', 'okay',
  'sad',
  'mad',
];
const PORTION_BUCKET: ReadonlyArray<Phase0MealPortion> = [
  'all', 'all', 'all', 'all',
  'some', 'some',
  'none',
];

function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Builds 0..N media attachments for a generated report. Seeded so the same
 * report id always produces the same photos — keeps the gallery stable
 * across reloads. We bias the photo density per institution kind so the
 * art studio feels like a portfolio, while karate / swim drop the occasional
 * action shot.
 */
function generateMedia(
  reportId: string,
  institutionId: string,
  date: string,
): Phase0DailyReportMedia[] {
  const seed = hash32(reportId);
  let chance: number;
  let maxCount: number;
  let captions: string[];
  switch (institutionId) {
    case 'inst_brushstrokes':
      chance = 70;
      maxCount = 3;
      captions = [
        'Today\u2019s painting',
        'Mixed-media collage piece',
        'Studio close-up',
        'Hand-print masterpiece',
        'Crayon study',
      ];
      break;
    case 'inst_sonata_music':
      chance = 25;
      maxCount = 1;
      captions = ['Practice session', 'End-of-class recital'];
      break;
    case 'inst_aqua_stars':
      chance = 35;
      maxCount = 2;
      captions = ['Pool deck', 'Mid-stroke action shot', 'Smiles after class'];
      break;
    case 'inst_kintaro_karate':
      chance = 30;
      maxCount = 2;
      captions = ['Dojo line-up', 'Form practice', 'Bowing in'];
      break;
    case 'tenant_little_stars':
      chance = 40;
      maxCount = 2;
      captions = [
        'Outdoor play',
        'Lunchtime smile',
        'Story circle',
        'Sandpit engineering',
        'Buddy moment',
      ];
      break;
    default:
      chance = 25;
      maxCount = 1;
      captions = ['From today\u2019s class'];
  }
  if ((seed % 100) >= chance) return [];
  const count = 1 + ((seed >>> 5) % maxCount);
  const out: Phase0DailyReportMedia[] = [];
  for (let i = 0; i < count; i++) {
    const photoSeed = `${reportId}-${i}`;
    out.push({
      id: `m_${reportId}_${i}`,
      kind: 'photo',
      url: `https://picsum.photos/seed/${encodeURIComponent(photoSeed)}/640/640`,
      caption: captions[(seed >>> (3 + i * 2)) % captions.length] ?? null,
    });
  }
  return out;
}

function generateKabeloHistory(): MockDailyReport[] {
  const out: MockDailyReport[] = [];
  const end = new Date(`${TREND_WINDOW_END}T00:00:00Z`);
  for (let offset = TREND_WINDOW_DAYS - 1; offset >= 0; offset--) {
    const day = new Date(end);
    day.setUTCDate(day.getUTCDate() - offset);
    const dateStr = isoDate(day);
    const dow = day.getUTCDay();

    for (const sub of KABELO_SUBS) {
      if (!sub.daysOfWeek.includes(dow)) continue;
      if (dateStr < sub.enrolledAt) continue;

      const seed = hash32(`${dateStr}|${sub.institutionId}`);
      const baseMood = MOOD_BUCKET[seed % MOOD_BUCKET.length];
      // Pin restless sleep to ~1-in-7 days so the correlation insight surfaces.
      const restlessSleep = (seed >>> 7) % 7 === 0;
      const mood: Phase0DailyReportMood = restlessSleep
        ? (seed % 2 === 0 ? 'okay' : 'sad')
        : baseMood;

      const kind = institutionKindOf(sub.institutionId);
      const vibe = sub.vibes[seed % sub.vibes.length];
      const moodLine =
        mood === 'happy' ? 'engaged and bright'
        : mood === 'okay' ? 'settled and steady'
        : mood === 'sad' ? 'a little subdued'
        : 'restless and short-fused';

      const reportId = `dr_kab_${dateStr}_${sub.institutionId}`;
      const base: Omit<MockDailyReport,
        'meals' | 'drinks' | 'sleep' | 'hygiene' | 'session' | 'reportKind'
      > = {
        id: reportId,
        parentChildId: 'pchild_kabelo',
        parentId: 'parent_thandi',
        institutionId: sub.institutionId,
        programId: sub.programId,
        reportDate: dateStr,
        status: 'published',
        postedAt: `${dateStr}T16:00:00Z`,
        publishedAt: `${dateStr}T16:00:00Z`,
        authorEmail: sub.authorEmail,
        authorName: sub.authorName,
        mood,
        summary:
          `${sub.classroom}: ${vibe}. Kabelo was ${moodLine} today.`,
        highlights: seed % 11 === 0 ? 'Tried something brand new and stuck with it.' : null,
        concerns: restlessSleep && seed % 3 === 0
          ? 'Tired this afternoon — last night\'s sleep was restless.'
          : null,
        media: generateMedia(reportId, sub.institutionId, dateStr),
      };

      if (kind === 'daycare') {
        out.push({
          ...base,
          reportKind: 'daycare',
          meals: {
            breakfast: PORTION_BUCKET[(seed >>> 2) % PORTION_BUCKET.length],
            snack: PORTION_BUCKET[(seed >>> 4) % PORTION_BUCKET.length],
            lunch: PORTION_BUCKET[(seed >>> 6) % PORTION_BUCKET.length],
          },
          drinks: { water: true, bottlesCount: ((seed >>> 9) % 3) + 1 },
          sleep: {
            noSleep: false,
            napStart: '12:30',
            napEnd: '13:30',
            napQuality: restlessSleep ? 'restless' : 'well',
          },
          hygiene: { pottyTraining: false, diaperChanges: null, notes: null },
          session: null,
        });
      } else {
        const focusAreas = sub.focusAreas ?? [vibe];
        const focus = focusAreas[seed % focusAreas.length];
        const skillsPool = sub.skillChips ?? [];
        const skillCount = skillsPool.length === 0 ? 0 : 1 + ((seed >>> 11) % Math.min(3, skillsPool.length));
        const skillsPracticed: string[] = [];
        for (let i = 0; i < skillCount; i++) {
          const pick = skillsPool[((seed >>> (12 + i * 3)) % skillsPool.length)];
          if (!skillsPracticed.includes(pick)) skillsPracticed.push(pick);
        }
        const attendance = ATTENDANCE_BUCKET[(seed >>> 14) % ATTENDANCE_BUCKET.length];
        const effort: Phase0SessionEffort | null = attendance === 'absent'
          ? null
          : EFFORT_BUCKET[(seed >>> 16) % EFFORT_BUCKET.length];
        const nextFocus = seed % 5 === 0 ? `Next time we'll build on "${focus}".` : null;

        out.push({
          ...base,
          reportKind: 'session',
          // Absences shouldn't carry mood / highlights / media — null them out.
          mood: attendance === 'absent' ? null : base.mood,
          highlights: attendance === 'absent' ? null : base.highlights,
          summary: attendance === 'absent'
            ? `${sub.classroom}: marked absent today.`
            : base.summary,
          media: attendance === 'absent' ? [] : base.media,
          meals: null,
          drinks: null,
          sleep: null,
          hygiene: null,
          session: {
            attendance,
            focus: attendance === 'absent' ? null : focus,
            effort,
            skillsPracticed: attendance === 'absent' ? [] : skillsPracticed,
            nextFocus,
          },
        });
      }
    }
  }
  return out;
}

MOCK_DAILY_REPORTS.push(...generateKabeloHistory());
