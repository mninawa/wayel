#!/usr/bin/env node
/**
 * Minimal Phase-0 platform API for local dev (matches apps/web-angular contracts).
 * Run: node tools/platform-mock-api/server.mjs
 * Default: http://127.0.0.1:5280 — use with web-angular proxy or platformApiUrl.
 */

import http from 'http';
import { randomUUID } from 'crypto';

const PORT = Number(process.env.PORT) || 5280;

/** @type {Record<string, unknown>[]} */
let tenants = [
  tenantToDto({
    id: 'tenant_little_stars',
    name: 'Little Stars Preschool',
    type: 'PRESCHOOL',
    slug: 'little-stars',
    plan: 'professional',
    status: 'active',
    timezone: 'Africa/Johannesburg',
    createdAt: '2025-08-01T10:00:00Z',
    firstAdminEmail: 'admin@littlestars.edu',
    firstAdminFirstName: 'Thandi',
    firstAdminLastName: 'Mavuso',
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2025-08-01T10:05:00Z',
    suspendedAt: null,
    maxChildren: 500,
  }),
  tenantToDto({
    id: 'tenant_code_cubs',
    name: 'Code Cubs Robotics',
    type: 'ROBOTICS_CLUB',
    slug: 'code-cubs',
    plan: 'starter',
    status: 'active',
    timezone: 'Africa/Johannesburg',
    createdAt: '2026-01-15T14:30:00Z',
    firstAdminEmail: 'ops@codecubs.example.com',
    firstAdminFirstName: null,
    firstAdminLastName: null,
    onboardedByUserId: 'user_platform_001',
    activatedAt: '2026-01-15T14:35:00Z',
    suspendedAt: null,
    maxChildren: 120,
  }),
];

function slugifyName(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

/**
 * The "current" institution — the one staff are signed in as. The mock pretends
 * everything is from Little Stars Preschool's perspective.
 */
const CURRENT_INSTITUTION = {
  id: 'tenant_little_stars',
  name: 'Little Stars Preschool',
  kind: 'daycare',
};

/* -------------------------------------------------------------------------- */
/* External-client: programs, accounts, sessions                              */
/* -------------------------------------------------------------------------- */

/**
 * Programs offered at CURRENT_INSTITUTION. Mirrors `MOCK_PROGRAMS` in
 * `packages/shared/src/core/mock/mock-data.ts`. Used by `/api/staff/me/programs`.
 */
const PROGRAMS = [
  { id: 'prog_1', name: 'Toddlers A', ageRange: '2\u20133', enrolledCount: 14 },
  { id: 'prog_2', name: 'Pre-K B', ageRange: '4\u20135', enrolledCount: 18 },
  { id: 'prog_3', name: 'Aftercare', ageRange: '3\u20136', enrolledCount: 22 },
];

function findProgram(id) {
  return PROGRAMS.find((p) => p.id === id) || null;
}

/**
 * Daily reports \u2014 mirrors `packages/shared/src/core/mock/mock-daily-reports.ts`.
 * Reports reference the parent's canonical `parentChildId`, not the
 * institution-side `child_*` record, so they follow the child across periods.
 */
const EMPTY_MEALS = { breakfast: null, snack: null, lunch: null };
const EMPTY_DRINKS = { water: false, bottlesCount: 0 };
const EMPTY_SLEEP = { noSleep: false, napStart: null, napEnd: null, napQuality: null };
const EMPTY_HYGIENE = { pottyTraining: false, diaperChanges: null, notes: null };

const dailyReports = [
  {
    id: 'dr_seed_001',
    parentChildId: 'pchild_azifani',
    parentId: 'parent_thandi',
    institutionId: 'tenant_little_stars',
    programId: 'prog_1',
    reportKind: 'daycare',
    session: null,
    reportDate: '2026-04-15',
    status: 'published',
    postedAt: '2026-04-15T15:42:00Z',
    publishedAt: '2026-04-15T15:42:00Z',
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    mood: 'happy',
    meals: { breakfast: 'all', snack: 'all', lunch: 'all' },
    drinks: { water: true, bottlesCount: 1 },
    sleep: { noSleep: false, napStart: '12:00', napEnd: '13:30', napQuality: 'well' },
    hygiene: { pottyTraining: true, diaperChanges: 0, notes: null },
    summary:
      'Great morning at circle time \u2014 Azifani led the weather song today and got everyone clapping along. After lunch we did finger-painting; her butterfly is on the noticeboard.',
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
    session: null,
    reportDate: '2026-04-16',
    status: 'published',
    postedAt: '2026-04-16T16:05:00Z',
    publishedAt: '2026-04-16T16:05:00Z',
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    mood: 'okay',
    meals: { breakfast: 'some', snack: 'all', lunch: 'all' },
    drinks: { water: true, bottlesCount: 2 },
    sleep: { noSleep: false, napStart: '12:00', napEnd: '13:00', napQuality: 'restless' },
    hygiene: { pottyTraining: true, diaperChanges: 1, notes: null },
    summary:
      'Quieter day. Azifani mostly played alongside the others rather than with them. Ate a full lunch and most of her snack.',
    highlights: null,
    concerns:
      'Coughed twice during nap \u2014 nothing alarming but worth keeping an eye on at home.',
    media: [
      {
        id: 'm_seed_002_a',
        kind: 'photo',
        url: 'https://picsum.photos/seed/azifani-quiet-day/640/640',
        caption: 'Sandpit on her own \u2014 happy enough',
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
    session: null,
    reportDate: '2026-04-17',
    status: 'draft',
    postedAt: '2026-04-17T11:20:00Z',
    publishedAt: null,
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    mood: null,
    meals: { breakfast: 'all', snack: null, lunch: null },
    drinks: { water: true, bottlesCount: 0 },
    sleep: { noSleep: false, napStart: null, napEnd: null, napQuality: null },
    hygiene: { pottyTraining: true, diaperChanges: 0, notes: null },
    summary: 'Morning notes only \u2014 will fill in the afternoon at pickup time.',
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
    session: null,
    reportDate: '2026-04-16',
    status: 'published',
    postedAt: '2026-04-16T16:10:00Z',
    publishedAt: '2026-04-16T16:10:00Z',
    authorEmail: 'jane@littlestars.test',
    authorName: 'Jane Naidoo',
    mood: 'happy',
    meals: { breakfast: 'all', snack: 'all', lunch: 'all' },
    drinks: { water: true, bottlesCount: 1 },
    sleep: { noSleep: false, napStart: '12:15', napEnd: '13:45', napQuality: 'well' },
    hygiene: { pottyTraining: true, diaperChanges: 0, notes: null },
    summary:
      "Liam asked to read the dinosaur book three times in a row. He ate his vegetarian lunch (no peanuts in today's snack).",
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

// `'neutral'` is accepted as a wire alias for the new `'okay'` label so older
// clients can still PUT/PATCH without breaking. Server normalises on read.
const VALID_MOODS = new Set(['happy', 'okay', 'sad', 'mad', 'neutral']);
const VALID_PORTIONS = new Set(['all', 'some', 'none']);
const VALID_NAP_QUALITY = new Set(['well', 'restless']);

function normaliseMood(m) {
  if (m === 'neutral') return 'okay';
  return m;
}

function normaliseMeals(input) {
  const src = input && typeof input === 'object' ? input : {};
  const pick = (k) =>
    src[k] === undefined ? null : VALID_PORTIONS.has(src[k]) ? src[k] : null;
  return { breakfast: pick('breakfast'), snack: pick('snack'), lunch: pick('lunch') };
}

function normaliseDrinks(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    water: src.water === true,
    bottlesCount: Number.isFinite(Number(src.bottlesCount))
      ? Math.max(0, Math.floor(Number(src.bottlesCount)))
      : 0,
  };
}

function normaliseSleep(input) {
  const src = input && typeof input === 'object' ? input : {};
  const time = (v) =>
    typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null;
  return {
    noSleep: src.noSleep === true,
    napStart: time(src.napStart),
    napEnd: time(src.napEnd),
    napQuality: VALID_NAP_QUALITY.has(src.napQuality) ? src.napQuality : null,
  };
}

function normaliseHygiene(input) {
  const src = input && typeof input === 'object' ? input : {};
  return {
    pottyTraining: src.pottyTraining === true,
    diaperChanges: Number.isFinite(Number(src.diaperChanges))
      ? Math.max(0, Math.floor(Number(src.diaperChanges)))
      : null,
    notes: typeof src.notes === 'string' && src.notes.trim() ? src.notes.trim() : null,
  };
}

const VALID_ATTENDANCE = new Set(['present', 'late', 'absent', 'left_early']);
const VALID_EFFORT = new Set(['needs_push', 'on_track', 'great_effort']);

function normaliseSession(input) {
  const src = input && typeof input === 'object' ? input : {};
  const focus = typeof src.focus === 'string' ? src.focus.trim() : '';
  const nextFocus = typeof src.nextFocus === 'string' ? src.nextFocus.trim() : '';
  const skillsPracticed = Array.isArray(src.skillsPracticed)
    ? src.skillsPracticed
        .filter((s) => typeof s === 'string' && s.trim())
        .map((s) => s.trim())
    : [];
  return {
    attendance: VALID_ATTENDANCE.has(src.attendance) ? src.attendance : 'present',
    focus: focus || null,
    effort: VALID_EFFORT.has(src.effort) ? src.effort : null,
    skillsPracticed,
    nextFocus: nextFocus || null,
  };
}

function normaliseMedia(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && typeof m === 'object' && typeof m.url === 'string')
    .map((m) => ({
      id: typeof m.id === 'string' && m.id ? m.id : `m_${randomUUID().slice(0, 8)}`,
      kind: m.kind === 'video' ? 'video' : 'photo',
      url: String(m.url),
      caption: typeof m.caption === 'string' && m.caption.trim() ? m.caption.trim() : null,
    }));
}

/** External-client accounts. Mirrors `MOCK_ACCOUNTS` in shared. Mock-only plaintext passwords. */
const accounts = [
  {
    id: 'acct_thandi',
    role: 'parent',
    email: 'thandi.mavuso@example.com',
    password: 'demo1234',
    displayName: 'Thandi Mavuso',
    phone: '+27 11 555 0100',
    createdAt: '2021-02-01T08:00:00Z',
    parentId: 'parent_thandi',
  },
  {
    id: 'acct_amara',
    role: 'parent',
    email: 'amara.lopez@example.com',
    password: 'demo1234',
    displayName: 'Amara Lopez',
    phone: '+27 21 555 0166',
    createdAt: '2024-08-12T08:00:00Z',
    parentId: 'parent_amara',
  },
  {
    id: 'acct_jane_staff',
    role: 'staff',
    email: 'jane@littlestars.test',
    password: 'demo1234',
    displayName: 'Jane Naidoo',
    phone: '+27 11 555 0142',
    createdAt: '2024-09-01T08:00:00Z',
    staffInstitutionId: 'tenant_little_stars',
    staffAssignedProgramIds: ['prog_1', 'prog_3'],
  },
  {
    id: 'acct_kabelo_staff',
    role: 'staff',
    email: 'kabelo@littlestars.test',
    password: 'demo1234',
    displayName: 'Kabelo Mahlangu',
    phone: '+27 11 555 0151',
    createdAt: '2025-02-14T08:00:00Z',
    staffInstitutionId: 'tenant_little_stars',
    staffAssignedProgramIds: ['prog_2'],
  },
];

/** Active session tokens. Empty on boot; populated by login/register, removed by logout. */
const sessions = [];
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function findAccountByEmail(email) {
  const needle = String(email || '').trim().toLowerCase();
  return accounts.find((a) => a.email.toLowerCase() === needle);
}

function findAccountById(id) {
  return accounts.find((a) => a.id === id);
}

function findSessionByToken(token) {
  return sessions.find((s) => s.token === token);
}

function issueSession(accountId) {
  const now = Date.now();
  const session = {
    token:
      'sess_' +
      Math.random().toString(36).slice(2, 10) +
      Math.random().toString(36).slice(2, 10),
    accountId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  sessions.push(session);
  return session;
}

function revokeSession(token) {
  const i = sessions.findIndex((s) => s.token === token);
  if (i !== -1) sessions.splice(i, 1);
}

/** Pull the bearer token off `Authorization: Bearer <token>`. Returns null if missing. */
function bearerToken(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'];
  if (!h || typeof h !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

/** Resolve the account for the bearer token. Returns `{account}` or `{error: {status, body}}`. */
function authenticate(req) {
  const token = bearerToken(req);
  if (!token) {
    return {
      error: { status: 401, body: { code: 'UNAUTHENTICATED', message: 'Bearer token required.' } },
    };
  }
  const session = findSessionByToken(token);
  if (!session) {
    return {
      error: { status: 401, body: { code: 'UNAUTHENTICATED', message: 'Invalid session.' } },
    };
  }
  if (Date.parse(session.expiresAt) < Date.now()) {
    revokeSession(session.token);
    return {
      error: { status: 401, body: { code: 'UNAUTHENTICATED', message: 'Session expired.' } },
    };
  }
  const account = findAccountById(session.accountId);
  if (!account) {
    return {
      error: { status: 401, body: { code: 'UNAUTHENTICATED', message: 'Account no longer exists.' } },
    };
  }
  return { account, session };
}

/** Project a raw `MockAccount` to the wire shape (drops password). */
function accountToDto(a) {
  const dto = {
    id: a.id,
    role: a.role,
    email: a.email,
    displayName: a.displayName,
    phone: a.phone,
    createdAt: a.createdAt,
  };
  if (a.role === 'parent' && a.parentId) {
    dto.parentId = a.parentId;
  }
  if (a.role === 'staff' && a.staffInstitutionId) {
    const inst = resolveInstitution(a.staffInstitutionId) || {
      id: a.staffInstitutionId,
      name: a.staffInstitutionId,
    };
    dto.staff = {
      institutionId: a.staffInstitutionId,
      institutionName: inst.name,
      assignedProgramIds: a.staffAssignedProgramIds || [],
    };
  }
  return dto;
}

/** Project a raw daily-report record to the wire shape (Phase0DailyReport). */
function dailyReportToDto(r) {
  const pc = findParentChild(r.parentChildId);
  const inst = resolveInstitution(r.institutionId) || {
    id: r.institutionId,
    name: r.institutionId,
  };
  const prog = r.programId ? findProgram(r.programId) : null;
  return {
    id: r.id,
    parentChildId: r.parentChildId,
    parentChildName: pc?.child.displayName || r.parentChildId,
    parentId: r.parentId,
    institutionId: inst.id,
    institutionName: inst.name,
    programId: r.programId || null,
    programName: prog?.name || null,
    reportKind: r.reportKind || institutionKindOf(r.institutionId),
    reportDate: r.reportDate,
    status: r.status,
    postedAt: r.postedAt,
    publishedAt: r.publishedAt,
    authorEmail: r.authorEmail,
    authorName: r.authorName,
    mood: normaliseMood(r.mood),
    // Cross-kind blocks stay null on the wire so the parent UI can pick
    // the right card without inferring kind from missing data.
    meals: r.meals ?? null,
    drinks: r.drinks ?? null,
    sleep: r.sleep ?? null,
    hygiene: r.hygiene ?? null,
    session: r.session ?? null,
    summary: r.summary,
    highlights: r.highlights,
    concerns: r.concerns,
    media: Array.isArray(r.media) ? r.media : [],
  };
}

// ---- Subscription-period & event helpers (mirror apps/web-angular's mock) ----

let pcsCounter = 0;
let evCounter = 0;
function nextPeriodId(slug) {
  return `pcs_${slug}_${(++pcsCounter).toString(36)}`;
}
function nextEventId(prefix) {
  return `ev_${prefix}_${(++evCounter).toString(36)}`;
}

function makeEvent(occurredAt, kind, summary, details = null, actor = null) {
  return {
    id: nextEventId(kind),
    occurredAt,
    kind,
    summary,
    details,
    actorEmail: actor?.email ?? 'admin@littlestars.edu',
    actorName: actor?.name ?? null,
  };
}

/**
 * Append an event to an open period. Refuses to mutate an ended period
 * (returns false) so the "ended periods are immutable" invariant holds.
 */
function appendPeriodEvent(period, event) {
  if (period.state === 'ended') {
    console.warn(`[server] refusing to append event to ended period ${period.id}`);
    return false;
  }
  period.events.push(event);
  return true;
}

/** Open period (pending/active/paused) at an institution, or null. */
function findOpenPeriod(parentChild, institutionId) {
  return (
    parentChild.subscriptions.find(
      (s) => s.institutionId === institutionId && s.state !== 'ended',
    ) || null
  );
}

/** Latest period (any state) at an institution. */
function findLatestPeriod(parentChild, institutionId) {
  const here = parentChild.subscriptions.filter(
    (s) => s.institutionId === institutionId,
  );
  if (!here.length) return null;
  return here.reduce((newest, p) => {
    const pStart = p.enrolledAt || p.events[0]?.occurredAt || '';
    const nStart = newest.enrolledAt || newest.events[0]?.occurredAt || '';
    return pStart > nStart ? p : newest;
  });
}

/** Sibling institutions used to seed cross-institution subscriptions. */
const OTHER_INSTITUTIONS = [
  { id: 'inst_aqua_stars',     name: 'Aqua Stars Swim Academy', kind: 'session' },
  { id: 'inst_kintaro_karate', name: 'Kintaro Karate Dojo',     kind: 'session' },
  { id: 'inst_brushstrokes',   name: 'Brushstrokes Art Studio', kind: 'session' },
  { id: 'inst_sonata_music',   name: 'Sonata Music School',     kind: 'session' },
];

function resolveInstitution(id) {
  if (!id || id === CURRENT_INSTITUTION.id) return CURRENT_INSTITUTION;
  return OTHER_INSTITUTIONS.find((i) => i.id === id) || null;
}

/** Resolve the institution kind for the daily-report shape. Defaults to daycare. */
function institutionKindOf(id) {
  const inst = resolveInstitution(id);
  return inst?.kind || 'daycare';
}

/**
 * Look up a parent-child by id across all parents.
 * @returns {{ parent: Object, child: Object } | null}
 */
function findParentChild(parentChildId) {
  for (const p of parents) {
    const c = p.children.find((x) => x.id === parentChildId);
    if (c) return { parent: p, child: c };
  }
  return null;
}

/**
 * The subscriptions of `parentChild` at institutions OTHER than the current
 * one — collapsed to the latest period per sibling institution so the legacy
 * compact summary stays stable. Returned in the shape of
 * `Phase0ChildOtherSubscription`.
 */
function otherSubscriptionsForParentChild(parentChild) {
  if (!parentChild) return [];
  const byInstitution = new Map();
  for (const s of parentChild.subscriptions) {
    if (s.institutionId === CURRENT_INSTITUTION.id) continue;
    const prev = byInstitution.get(s.institutionId);
    const sStart = s.enrolledAt || s.events[0]?.occurredAt || '';
    const pStart = prev?.enrolledAt || prev?.events[0]?.occurredAt || '';
    if (!prev || sStart > pStart) byInstitution.set(s.institutionId, s);
  }
  return [...byInstitution.values()].map((s) => {
    const inst = resolveInstitution(s.institutionId) || {
      id: s.institutionId,
      name: s.institutionId,
    };
    return {
      id: `sub_${parentChild.id}_${inst.id}`,
      institutionId: inst.id,
      institutionName: inst.name,
      state: s.state,
      enrolledAt: s.enrolledAt,
    };
  });
}

/** Project the canonical periods into the parent-owned lifetime view. */
function lifetimeFromParentChild(parentChild) {
  if (!parentChild) return [];
  const sorted = [...parentChild.subscriptions].sort((a, b) => {
    const aStart = a.enrolledAt || a.events[0]?.occurredAt || '';
    const bStart = b.enrolledAt || b.events[0]?.occurredAt || '';
    return aStart < bStart ? 1 : aStart > bStart ? -1 : 0;
  });
  return sorted.map((s) => {
    const inst = resolveInstitution(s.institutionId) || {
      id: s.institutionId,
      name: s.institutionId,
    };
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
      events: s.events.map((e) => ({
        id: e.id,
        occurredAt: e.occurredAt,
        kind: e.kind,
        summary: e.summary,
        details: e.details,
        actorEmail: e.actorEmail,
        actorName: e.actorName,
      })),
    };
  });
}

/** Flat skills list across all periods (most-recent first). */
function skillsFromParentChild(parentChild) {
  if (!parentChild) return [];
  const out = [];
  for (const s of parentChild.subscriptions) {
    const inst = resolveInstitution(s.institutionId) || {
      id: s.institutionId,
      name: s.institutionId,
    };
    for (const e of s.events) {
      if (e.kind !== 'skill_earned') continue;
      const d = e.details || {};
      out.push({
        id: e.id,
        skillName: d.skillName || e.summary,
        programName: d.programName || '—',
        occurredAt: String(e.occurredAt).slice(0, 10),
        institutionId: inst.id,
        institutionName: inst.name,
        instructorEmail: d.instructorEmail || e.actorEmail || 'unknown@example.com',
        instructorName: d.instructorName || e.actorName || null,
      });
    }
  }
  return out.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
}

/** Legacy `Phase0ChildSubscription.history` projection from a period's events. */
function historyFromPeriod(period) {
  if (!period) return [];
  const out = [];
  for (const e of period.events) {
    let state = null;
    if (e.kind === 'enrolled') state = 'active';
    else if (e.kind === 'paused') state = 'paused';
    else if (e.kind === 'resumed') state = 'active';
    else if (e.kind === 'ended') state = 'ended';
    else if (e.kind === 'state_change') state = e.details?.to || null;
    if (!state) continue;
    out.push({
      id: e.id,
      occurredAt: e.occurredAt,
      state,
      note:
        e.details?.reason ??
        (e.kind === 'enrolled' ? e.summary : null),
      actorEmail: e.actorEmail,
    });
  }
  return out.reverse();
}

/**
 * Build the child detail payload from the canonical periods on the linked
 * parent-child. No cache: the periods are themselves the source of truth and
 * mutate in place, so building on demand is always correct.
 */
function buildChildDetail(row) {
  const link = row.parentChildId ? findParentChild(row.parentChildId) : null;
  const parent = link?.parent || null;
  const parentChild = link?.child || null;
  const latestHere = parentChild
    ? findLatestPeriod(parentChild, CURRENT_INSTITUTION.id)
    : null;

  const guardians = parent
    ? [
        {
          id: `guard_${row.id}_1`,
          displayName: parent.displayName,
          email: parent.email,
          phone: parent.phone,
          relationship: 'Parent',
        },
      ]
    : row.guardianNames.map((name, idx) => ({
        id: `guard_${row.id}_${idx + 1}`,
        displayName: name,
        email: idx === 0 ? `${slugifyName(name)}@example.com` : null,
        phone: idx === 0 ? '+27 11 555 0100' : null,
        relationship: idx === 0 ? 'Primary guardian' : 'Guardian',
      }));

  const otherSubscriptions = otherSubscriptionsForParentChild(parentChild);
  const subscriptionTimeline = lifetimeFromParentChild(parentChild);
  const currentSubscription = {
    id: latestHere?.id || `sub_${row.id}_${CURRENT_INSTITUTION.id}`,
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    state: row.membershipState,
    enrolledAt:
      latestHere?.enrolledAt ||
      (row.membershipState === 'pending' ? null : '2024-01-15'),
    classroom: latestHere?.classroom ?? null,
    history: historyFromPeriod(latestHere),
  };
  return {
    id: row.id,
    displayName: row.displayName,
    dateOfBirth: row.dateOfBirth,
    notes: parentChild?.notes ?? null,
    parentChildId: row.parentChildId ?? null,
    parentId: row.parentId ?? null,
    parentDisplayName: parent?.displayName ?? null,
    guardians,
    currentSubscription,
    otherSubscriptions,
    skills: skillsFromParentChild(parentChild),
    subscriptionTimeline,
  };
}

function appendAudit(entry) {
  audit = [
    {
      id: `pau_${randomUUID().slice(0, 8)}`,
      occurredAt: new Date().toISOString(),
      actorEmail: 'platform@wayel.example',
      tenantId: null,
      tenantName: null,
      action: 'platform.event',
      detail: '',
      ...entry,
    },
    ...audit,
  ];
}

function tenantToSettingsDto(t) {
  return {
    tenantId: t.id,
    name: t.name,
    type: t.type,
    timezone: t.timezone,
    joinMode: 'approval-required',
    joinCode: `${t.slug.replace(/-/g, '').slice(0, 4).toUpperCase()}-2026`,
    joinCodeActive: t.status === 'active',
    primaryColor: '#1e3a5f',
    accentColor: '#f59e0b',
    logoUrl: null,
  };
}

/**
 * Build the JSON snapshot the parent can download. Self-contained — includes
 * parent + child identity inline so the file is meaningful on its own without
 * any platform context. Sealed periods are flagged so the parent (or any
 * downstream tool) knows what's immutable.
 */
function buildArchiveSnapshot(parent, parentChild, periods) {
  const sortedPeriods = [...periods].sort((a, b) => {
    const aStart = a.enrolledAt || a.events[0]?.occurredAt || '';
    const bStart = b.enrolledAt || b.events[0]?.occurredAt || '';
    return aStart < bStart ? 1 : aStart > bStart ? -1 : 0;
  });
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
      id: parentChild.id,
      displayName: parentChild.displayName,
      dateOfBirth: parentChild.dateOfBirth,
      notes: parentChild.notes,
      photoUrl: parentChild.photoUrl ?? null,
    },
    periods: sortedPeriods.map((s) => {
      const inst = resolveInstitution(s.institutionId) || {
        id: s.institutionId,
        name: s.institutionId,
      };
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
          details: e.details,
          actorEmail: e.actorEmail,
          actorName: e.actorName,
        })),
      };
    }),
    memories: ((parentChild.memories || [])
      .slice()
      .sort((a, b) =>
        a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
      )
      .map((m) => memoryToDto(m, parentChild.id))),
  };
}

function memoryToDto(m, parentChildId) {
  const inst = m.institutionId ? resolveInstitution(m.institutionId) : null;
  return {
    id: m.id,
    parentChildId,
    kind: m.kind === 'video' ? 'video' : 'photo',
    url: m.url,
    caption: m.caption ?? null,
    occurredAt: m.occurredAt,
    createdAt: m.createdAt,
    tag: m.tag ?? null,
    institutionId: inst?.id ?? m.institutionId ?? null,
    institutionName: inst?.name ?? null,
  };
}

function parentToDto(parent) {
  return {
    id: parent.id,
    displayName: parent.displayName,
    email: parent.email,
    phone: parent.phone,
    createdAt: parent.createdAt,
    children: parent.children.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      dateOfBirth: c.dateOfBirth,
      notes: c.notes,
      photoUrl: c.photoUrl ?? null,
    })),
  };
}

function tenantToDto(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    slug: row.slug,
    plan: row.plan,
    status: row.status,
    timezone: row.timezone,
    createdAt: row.createdAt,
    firstAdminEmail: row.firstAdminEmail,
    firstAdminFirstName: row.firstAdminFirstName,
    firstAdminLastName: row.firstAdminLastName,
    onboardedByUserId: row.onboardedByUserId,
    activatedAt: row.activatedAt,
    suspendedAt: row.suspendedAt,
    maxChildren: row.maxChildren,
  };
}

const users = [
  {
    id: 'user_platform_001',
    email: 'platform@wayel.example',
    displayName: 'Neo Dlamini',
    role: 'platform_admin',
    homeTenantId: null,
    homeTenantName: null,
    status: 'active',
    lastLoginAt: '2026-04-17T08:12:00Z',
    createdAt: '2025-01-10T00:00:00Z',
  },
  {
    id: 'user_platform_002',
    email: 'support@wayel.example',
    displayName: 'Priya Govender',
    role: 'support',
    homeTenantId: null,
    homeTenantName: null,
    status: 'active',
    lastLoginAt: '2026-04-16T14:30:00Z',
    createdAt: '2025-06-01T00:00:00Z',
  },
  {
    id: 'user_platform_003',
    email: 'liaison@littlestars.edu',
    displayName: 'Thandi Mavuso',
    role: 'support',
    homeTenantId: 'tenant_little_stars',
    homeTenantName: 'Little Stars Preschool',
    status: 'active',
    lastLoginAt: '2026-04-15T11:00:00Z',
    createdAt: '2025-08-02T00:00:00Z',
  },
  {
    id: 'user_platform_004',
    email: 'new.ops@wayel.example',
    displayName: 'Jamal Okonkwo',
    role: 'support',
    homeTenantId: null,
    homeTenantName: null,
    status: 'invited',
    lastLoginAt: null,
    createdAt: '2026-04-10T00:00:00Z',
  },
];

let audit = [
  {
    id: 'pau_1',
    occurredAt: '2026-04-17T07:55:00Z',
    actorEmail: 'platform@wayel.example',
    tenantId: 'tenant_little_stars',
    tenantName: 'Little Stars Preschool',
    action: 'tenant.settings.viewed',
    detail: 'Reviewed max children cap (mock API).',
  },
  {
    id: 'pau_2',
    occurredAt: '2026-04-16T16:20:00Z',
    actorEmail: 'support@wayel.example',
    tenantId: 'tenant_code_cubs',
    tenantName: 'Code Cubs Robotics',
    action: 'tenant.support_note',
    detail: 'Follow-up on onboarding checklist.',
  },
  {
    id: 'pau_3',
    occurredAt: '2026-04-16T09:00:00Z',
    actorEmail: 'platform@wayel.example',
    tenantId: null,
    tenantName: null,
    action: 'platform.report.exported',
    detail: 'Monthly tenant summary CSV (mock API).',
  },
];

/**
 * Parents (the source of truth for child identities).
 *
 * Each parent owns a roster of children. Each child carries the list of
 * institutions they're subscribed to, including the current one — the
 * institution-side `children` list below is *derived* from this so the same
 * canonical identity (`pchild_*`) ties together a child's enrolments across
 * institutions.
 *
 * For parent-children that have a current-institution subscription, we set
 * `institutionChildId` so the existing `child_NNN` ids the rest of the mock
 * already references stay stable.
 */
/** Build an "open period" with a single enrolled event for active/pending seeds. */
function seedOpenPeriod(slug, institutionId, institutionChildId, opts) {
  const enrolledAt = opts.enrolledAt;
  const events = [];
  if (opts.state !== 'pending' && enrolledAt) {
    events.push(
      makeEvent(
        `${enrolledAt}T08:00:00Z`,
        'enrolled',
        `Enrolled${opts.classroom ? ` in ${opts.classroom}` : ''}.`,
        { classroom: opts.classroom ?? null },
      ),
    );
  }
  if (opts.state === 'paused' && opts.pausedAt) {
    events.push(
      makeEvent(`${opts.pausedAt}T10:00:00Z`, 'paused', 'Period paused.', {
        from: 'active',
        to: 'paused',
        reason: opts.pausedReason ?? null,
      }),
    );
  }
  return {
    id: nextPeriodId(slug),
    institutionId,
    institutionChildId,
    state: opts.state,
    enrolledAt: opts.state === 'pending' ? null : enrolledAt,
    endedAt: null,
    endedReason: null,
    archivedAt: null,
    classroom: opts.classroom ?? null,
    events,
  };
}

const parents = [
  {
    id: 'parent_thandi',
    displayName: 'Thandi Mavuso',
    email: 'thandi.mavuso@example.com',
    phone: '+27 11 555 0100',
    createdAt: '2021-02-01T08:00:00Z',
    children: [
      {
        id: 'pchild_azifani',
        displayName: 'Azifani Mavuso',
        dateOfBirth: '2021-03-12',
        notes: 'No known allergies. Carries an asthma pump.',
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
            caption: "First lesson at Aqua Stars — he wasn't scared at all.",
            occurredAt: '2024-09-04',
            createdAt: '2024-09-04T17:10:00Z',
            tag: 'First time',
            institutionId: 'inst_aqua_stars',
          },
        ],
        // 5-year lifetime (born 2021, currently age 5): the canonical example
        // of a child who has accumulated multiple sealed periods over time.
        subscriptions: [
          {
            id: nextPeriodId('azi_ls_2021'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_001',
            state: 'ended',
            enrolledAt: '2021-09-01',
            endedAt: '2022-06-30',
            endedReason: 'Family relocated for a year.',
            archivedAt: '2022-07-15T10:00:00Z',
            classroom: 'Buttercups (0-1 yr)',
            events: [
              makeEvent('2021-08-25T09:00:00Z', 'enrolled', 'Enrolled in Buttercups (0-1 yr).', {
                classroom: 'Buttercups (0-1 yr)',
              }),
              makeEvent('2021-12-10T10:00:00Z', 'milestone', 'First steps observed at school.', {
                note: 'Walked 4 steps unassisted to teacher.',
              }),
              makeEvent('2022-04-22T09:30:00Z', 'skill_earned', 'Recognises own name when called.', {
                skillName: 'Recognises own name',
                programName: 'Buttercups — Term 2 2022',
                instructorEmail: 'thandi@example.com',
                instructorName: 'Thandi Mokoena',
              }),
              makeEvent('2022-06-30T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Family relocated for a year.',
              }),
            ],
          },
          {
            id: nextPeriodId('azi_bs_2022'),
            institutionId: 'inst_brushstrokes',
            state: 'ended',
            enrolledAt: '2022-08-01',
            endedAt: '2023-07-15',
            endedReason: 'Returned home — re-enrolled at Little Stars.',
            archivedAt: '2023-07-30T08:00:00Z',
            classroom: 'Mini Makers',
            events: [
              makeEvent('2022-08-01T08:00:00Z', 'enrolled', 'Enrolled in Mini Makers.', {
                classroom: 'Mini Makers',
              }, { email: 'lead@brushstrokes.example', name: 'Brushstrokes Lead' }),
              makeEvent('2023-03-04T11:00:00Z', 'skill_earned', 'Holds a crayon with pincer grip.', {
                skillName: 'Pincer grip on crayon',
                programName: 'Mini Makers — Term 1 2023',
                instructorEmail: 'lead@brushstrokes.example',
                instructorName: 'Brushstrokes Lead',
              }),
              makeEvent('2023-07-15T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Returned home — re-enrolled at Little Stars.',
              }),
            ],
          },
          {
            id: nextPeriodId('azi_ls_2023'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_001',
            state: 'ended',
            enrolledAt: '2023-08-01',
            endedAt: '2024-01-14',
            endedReason: 'Promoted to next age group on schedule.',
            archivedAt: '2024-01-30T08:00:00Z',
            classroom: 'Daisies (2-3 yrs)',
            events: [
              makeEvent('2023-08-01T08:00:00Z', 'enrolled', 'Re-enrolled in Daisies (2-3 yrs).', {
                classroom: 'Daisies (2-3 yrs)',
              }),
              makeEvent('2023-11-15T10:00:00Z', 'skill_earned', 'Counts to 5 unaided.', {
                skillName: 'Counts to 5 unaided',
                programName: 'Daisies — Term 4 2023',
                instructorEmail: 'thandi@example.com',
                instructorName: 'Thandi Mokoena',
              }),
              makeEvent('2024-01-14T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Promoted to next age group on schedule.',
              }),
            ],
          },
          {
            id: nextPeriodId('azi_ls_2024'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_001',
            state: 'active',
            enrolledAt: '2024-01-15',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Sunflowers (3-4 yrs)',
            events: [
              makeEvent('2024-01-15T08:00:00Z', 'enrolled', 'Enrolled in Sunflowers (3-4 yrs).', {
                classroom: 'Sunflowers (3-4 yrs)',
              }),
              makeEvent('2024-02-20T10:30:00Z', 'skill_earned', 'Recognises own name in writing.', {
                skillName: 'Recognises own name',
                programName: 'Sunflowers — Term 1 2024',
                instructorEmail: 'thandi@example.com',
                instructorName: 'Thandi Mokoena',
              }),
              makeEvent('2024-05-14T10:30:00Z', 'skill_earned', 'Counts to 10 unaided.', {
                skillName: 'Counts to 10 unaided',
                programName: 'Sunflowers — Term 2 2024',
                instructorEmail: 'thandi@example.com',
                instructorName: 'Thandi Mokoena',
              }),
              makeEvent('2024-09-02T10:00:00Z', 'skill_earned', 'Tying shoelaces.', {
                skillName: 'Tying shoelaces',
                programName: 'Daily Living Skills — Term 3 2024',
                instructorEmail: 'sipho@example.com',
                instructorName: 'Sipho Dlamini',
              }),
            ],
          },
          {
            id: nextPeriodId('azi_aq_2024'),
            institutionId: 'inst_aqua_stars',
            state: 'active',
            enrolledAt: '2024-04-08',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Beginner Swim',
            events: [
              makeEvent('2024-04-08T08:00:00Z', 'enrolled', 'Enrolled in Beginner Swim.', {
                classroom: 'Beginner Swim',
              }, { email: 'coach@aquastars.example', name: 'Coach' }),
              makeEvent('2024-06-22T11:00:00Z', 'skill_earned', 'Front crawl: 25m.', {
                skillName: 'Front crawl: 25m',
                programName: 'Beginner Swim — Term 2 2024',
                instructorEmail: 'coach@aquastars.example',
                instructorName: 'Coach',
              }, { email: 'coach@aquastars.example', name: 'Coach' }),
            ],
          },
        ],
      },
      {
        id: 'pchild_simi',
        displayName: 'Simi Mavuso',
        dateOfBirth: '2023-07-04',
        notes: 'Lactose intolerant. Loves singing.',
        photoUrl:
          'https://api.dicebear.com/7.x/adventurer/svg?seed=Simi&backgroundColor=ffd5dc',
        subscriptions: [
          {
            id: nextPeriodId('simi_bs_2025'),
            institutionId: 'inst_brushstrokes',
            state: 'active',
            enrolledAt: '2025-02-03',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Tiny Picassos',
            events: [
              makeEvent('2025-02-03T08:00:00Z', 'enrolled', 'Enrolled in Tiny Picassos.', {
                classroom: 'Tiny Picassos',
              }, { email: 'lead@brushstrokes.example', name: 'Brushstrokes Lead' }),
              makeEvent('2025-05-12T10:00:00Z', 'milestone', 'First finger-paint masterpiece.', {
                note: 'Used three colours independently.',
              }, { email: 'lead@brushstrokes.example', name: 'Brushstrokes Lead' }),
              makeEvent('2026-01-21T10:30:00Z', 'skill_earned', 'Names primary colours.', {
                skillName: 'Names primary colours',
                programName: 'Tiny Picassos — Term 1 2026',
                instructorEmail: 'lead@brushstrokes.example',
                instructorName: 'Brushstrokes Lead',
              }, { email: 'lead@brushstrokes.example', name: 'Brushstrokes Lead' }),
            ],
          },
        ],
      },
      {
        id: 'pchild_kabelo',
        displayName: 'Kabelo Mavuso',
        dateOfBirth: '2017-10-19',
        notes: 'Wears glasses for reading.',
        photoUrl:
          'https://api.dicebear.com/7.x/adventurer/svg?seed=Kabelo&backgroundColor=c0aede',
        subscriptions: [
          {
            id: nextPeriodId('kab_kk_2023'),
            institutionId: 'inst_kintaro_karate',
            state: 'ended',
            enrolledAt: '2023-02-06',
            endedAt: '2024-12-15',
            endedReason: 'Promoted to next belt group.',
            archivedAt: '2025-01-05T08:00:00Z',
            classroom: 'White Belts',
            events: [
              makeEvent('2023-02-06T08:00:00Z', 'enrolled', 'Enrolled in White Belts.', {
                classroom: 'White Belts',
              }, { email: 'sensei@kintaro.example', name: 'Sensei Kintaro' }),
              makeEvent('2024-03-09T11:00:00Z', 'skill_earned', 'Earned yellow belt.', {
                skillName: 'Yellow belt',
                programName: 'White Belts — Spring 2024',
                instructorEmail: 'sensei@kintaro.example',
                instructorName: 'Sensei Kintaro',
              }, { email: 'sensei@kintaro.example', name: 'Sensei Kintaro' }),
              makeEvent('2024-12-15T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Promoted to next belt group.',
              }),
            ],
          },
          {
            id: nextPeriodId('kab_kk_2025'),
            institutionId: 'inst_kintaro_karate',
            state: 'active',
            enrolledAt: '2025-01-20',
            endedAt: null,
            endedReason: null,
            archivedAt: null,
            classroom: 'Orange Belts',
            events: [
              makeEvent('2025-01-20T08:00:00Z', 'enrolled', 'Enrolled in Orange Belts.', {
                classroom: 'Orange Belts',
              }, { email: 'sensei@kintaro.example', name: 'Sensei Kintaro' }),
              makeEvent('2026-02-14T11:00:00Z', 'milestone', 'Won bronze at regional kata.', {
                note: 'First competition medal.',
              }, { email: 'sensei@kintaro.example', name: 'Sensei Kintaro' }),
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
    createdAt: '2024-02-14T08:00:00Z',
    children: [
      {
        id: 'pchild_liam',
        displayName: 'Liam Chen',
        dateOfBirth: '2020-11-02',
        notes: 'Vegetarian. Peanut allergy.',
        subscriptions: [
          seedOpenPeriod('liam_ls', 'tenant_little_stars', 'child_002', {
            state: 'active',
            enrolledAt: '2024-01-22',
            classroom: 'Sunflowers (3-4 yrs)',
          }),
          seedOpenPeriod('liam_son', 'inst_sonata_music', undefined, {
            state: 'active',
            enrolledAt: '2024-03-01',
            classroom: 'Tiny Strings',
          }),
        ],
      },
    ],
  },
  {
    id: 'parent_priya',
    displayName: 'Priya Naidoo',
    email: 'priya.naidoo@example.com',
    phone: null,
    createdAt: '2024-04-01T08:00:00Z',
    children: [
      {
        id: 'pchild_zara',
        displayName: 'Zara Naidoo',
        dateOfBirth: '2022-01-20',
        notes: 'Quiet, gentle child — first time in any program.',
        subscriptions: [
          seedOpenPeriod('zara_ls', 'tenant_little_stars', 'child_003', {
            state: 'pending',
            enrolledAt: null,
            classroom: 'Sunflowers (3-4 yrs)',
          }),
        ],
      },
      {
        id: 'pchild_sahil',
        displayName: 'Sahil Naidoo',
        dateOfBirth: '2019-08-04',
        notes: null,
        subscriptions: [
          seedOpenPeriod('sahil_kk', 'inst_kintaro_karate', undefined, {
            state: 'active',
            enrolledAt: '2023-06-01',
            classroom: 'Little Tigers',
          }),
        ],
      },
    ],
  },
  {
    id: 'parent_lara',
    displayName: 'Lara Petersen',
    email: 'lara.petersen@example.com',
    phone: '+27 21 555 0144',
    createdAt: '2024-01-30T08:00:00Z',
    children: [
      {
        id: 'pchild_noah',
        displayName: 'Noah Petersen',
        dateOfBirth: '2021-07-18',
        notes: null,
        subscriptions: [
          seedOpenPeriod('noah_ls', 'tenant_little_stars', 'child_004', {
            state: 'active',
            enrolledAt: '2024-02-01',
            classroom: 'Sunflowers (3-4 yrs)',
          }),
          seedOpenPeriod('noah_bs', 'inst_brushstrokes', undefined, {
            state: 'active',
            enrolledAt: '2024-05-10',
            classroom: 'Mini Makers',
          }),
        ],
      },
    ],
  },
  {
    id: 'parent_chinwe',
    displayName: 'Chinwe Okafor',
    email: 'chinwe.okafor@example.com',
    phone: null,
    createdAt: '2024-01-12T08:00:00Z',
    children: [
      {
        id: 'pchild_amara',
        displayName: 'Amara Okafor',
        dateOfBirth: '2020-05-09',
        notes: 'Family relocated temporarily — paused for now.',
        subscriptions: [
          seedOpenPeriod('amara_ls', 'tenant_little_stars', 'child_005', {
            state: 'paused',
            enrolledAt: '2024-01-15',
            classroom: 'Sunflowers (3-4 yrs)',
            pausedAt: '2025-09-01',
            pausedReason: 'Family relocated temporarily.',
          }),
        ],
      },
    ],
  },
  {
    id: 'parent_marlene',
    displayName: 'Marlene Visser',
    email: 'marlene.visser@example.com',
    phone: null,
    createdAt: '2023-08-22T08:00:00Z',
    children: [
      {
        id: 'pchild_ethan',
        displayName: 'Ethan Visser',
        dateOfBirth: '2019-12-14',
        notes: 'Graduated to primary school.',
        subscriptions: [
          {
            id: nextPeriodId('ethan_ls'),
            institutionId: 'tenant_little_stars',
            institutionChildId: 'child_006',
            state: 'ended',
            enrolledAt: '2023-09-01',
            endedAt: '2024-12-15',
            endedReason: 'Graduated to primary school.',
            archivedAt: '2024-12-30T10:00:00Z',
            classroom: 'Sunflowers (3-4 yrs)',
            events: [
              makeEvent('2023-09-01T08:00:00Z', 'enrolled', 'Enrolled in Sunflowers.', {
                classroom: 'Sunflowers (3-4 yrs)',
              }),
              makeEvent('2024-12-15T15:00:00Z', 'ended', 'Period ended.', {
                from: 'active',
                to: 'ended',
                reason: 'Graduated to primary school.',
              }),
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'parent_reshma',
    displayName: 'Reshma Naicker',
    email: 'reshma.naicker@example.com',
    phone: '+27 31 555 0177',
    createdAt: '2024-04-02T08:00:00Z',
    children: [
      {
        id: 'pchild_isla',
        displayName: 'Isla Naicker',
        dateOfBirth: '2022-03-30',
        notes: null,
        subscriptions: [
          seedOpenPeriod('isla_ls', 'tenant_little_stars', 'child_007', {
            state: 'pending',
            enrolledAt: null,
            classroom: 'Daisies (2-3 yrs)',
          }),
          seedOpenPeriod('isla_aq', 'inst_aqua_stars', undefined, {
            state: 'active',
            enrolledAt: '2024-03-12',
            classroom: 'Splash Babies',
          }),
        ],
      },
    ],
  },
  // Parent who hasn't subscribed anywhere yet — useful for the simulator to
  // exercise "pick a child, send a fresh request to current institution".
  {
    id: 'parent_ada',
    displayName: 'Ada Okonkwo',
    email: 'ada.okonkwo@example.com',
    phone: null,
    createdAt: '2026-04-15T08:00:00Z',
    children: [
      {
        id: 'pchild_jamal',
        displayName: 'Jamal Okonkwo',
        dateOfBirth: '2020-11-22',
        notes: null,
        subscriptions: [],
      },
      {
        id: 'pchild_chika',
        displayName: 'Chika Okonkwo',
        dateOfBirth: '2022-06-04',
        notes: null,
        subscriptions: [],
      },
    ],
  },
];

/**
 * Subscription-request inbox. Parents subscribe via the parent app and the
 * resulting requests land here for staff to approve or reject. Each entry
 * references a parent + parent-child; the denormalized child/parent display
 * fields are snapshots populated at submit time so the inbox renders without
 * a roundtrip.
 */
const subscriptionRequests = [
  // Priya's child Zara — already represented in the institution-side roster
  // as child_003 with `pending` state; this is the corresponding request.
  {
    id: 'sr_001',
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    parentId: 'parent_priya',
    parentChildId: 'pchild_zara',
    institutionChildId: 'child_003',
    childDisplayName: 'Zara Naidoo',
    childDateOfBirth: '2022-01-20',
    parentEmail: 'priya.naidoo@example.com',
    parentDisplayName: 'Priya Naidoo',
    message: 'Zara is a quiet, gentle child — first time in any program.',
    classroomRequested: 'Sunflowers (3-4 yrs)',
    requestedAt: '2026-04-16T09:15:00Z',
    status: 'pending',
    resolvedChildId: null,
    rejectionReason: null,
    resolvedAt: null,
    resolvedByEmail: null,
  },
  // Ada's child Jamal — fresh parent, no subscriptions yet.
  {
    id: 'sr_002',
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    parentId: 'parent_ada',
    parentChildId: 'pchild_jamal',
    institutionChildId: null,
    childDisplayName: 'Jamal Okonkwo',
    childDateOfBirth: '2020-11-22',
    parentEmail: 'ada.okonkwo@example.com',
    parentDisplayName: 'Ada Okonkwo',
    message: null,
    classroomRequested: null,
    requestedAt: '2026-04-15T14:40:00Z',
    status: 'pending',
    resolvedChildId: null,
    rejectionReason: null,
    resolvedAt: null,
    resolvedByEmail: null,
  },
  // Mei's child Liam — already approved earlier; resolvedChildId points to
  // the existing child_002 record.
  {
    id: 'sr_003',
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    parentId: 'parent_mei',
    parentChildId: 'pchild_liam',
    institutionChildId: 'child_002',
    childDisplayName: 'Liam Chen',
    childDateOfBirth: '2020-11-02',
    parentEmail: 'mei.chen@example.com',
    parentDisplayName: 'Mei Chen',
    message: 'Currently at Sonata Music too — he loves music days.',
    classroomRequested: 'Sunflowers (3-4 yrs)',
    requestedAt: '2026-04-12T07:20:00Z',
    status: 'approved',
    resolvedChildId: 'child_002',
    rejectionReason: null,
    resolvedAt: '2026-04-12T08:05:00Z',
    resolvedByEmail: 'admin@littlestars.edu',
  },
];

/**
 * Institution-side roster for the current institution, derived from the parent
 * table at startup. Each row carries `parentId` + `parentChildId` so the same
 * canonical identity ties together cross-institution data.
 */
const children = (() => {
  const list = [];
  const seenIds = new Set();
  for (const p of parents) {
    for (const pc of p.children) {
      // Prefer the open period at the current institution; fall back to the
      // latest ended one (so an alumni still appears in the roster as ended).
      const open = findOpenPeriod(pc, CURRENT_INSTITUTION.id);
      const latest = open || findLatestPeriod(pc, CURRENT_INSTITUTION.id);
      if (!latest) continue;
      const id = latest.institutionChildId || `child_pc_${pc.id.slice(7)}`;
      latest.institutionChildId = id;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      list.push({
        id,
        displayName: pc.displayName,
        dateOfBirth: pc.dateOfBirth,
        guardianNames: [p.displayName],
        membershipState: latest.state,
        parentId: p.id,
        parentChildId: pc.id,
      });
    }
  }
  return list;
})();

/**
 * Default base URL the mock server uses when building absolute accept URLs.
 * Override at runtime via INVITE_BASE_URL env var.
 */
const INVITE_BASE_URL =
  process.env.INVITE_BASE_URL || 'http://127.0.0.1:4400';

/** Generate a URL-safe opaque invite token. */
function generateInviteToken() {
  return `tok_${randomUUID().replace(/-/g, '')}${randomUUID()
    .replace(/-/g, '')
    .slice(0, 16)}`;
}

/** Build the absolute URL the recipient opens to redeem an invite. */
function inviteAcceptUrl(token, req) {
  const origin =
    (req &&
      (req.headers['x-forwarded-origin'] ||
        req.headers.origin ||
        (req.headers.referer && new URL(req.headers.referer).origin))) ||
    INVITE_BASE_URL;
  return `${origin}/accept-invite?token=${encodeURIComponent(token)}`;
}

/** Project the in-memory invitation onto the public DTO shape. */
function staffInvitationToDto(inv, req) {
  return {
    id: inv.id,
    institutionId: inv.institutionId,
    institutionName: inv.institutionName,
    email: inv.email,
    phone: inv.phone || null,
    role: inv.role,
    invitedAt: inv.invitedAt,
    invitedByEmail: inv.invitedByEmail,
    expiresAt: inv.expiresAt,
    status: inv.status,
    lastResentAt: inv.lastResentAt || null,
    lastSentVia: inv.lastSentVia || null,
    acceptedAt: inv.acceptedAt || null,
    acceptedByName: inv.acceptedByName || null,
    revokedAt: inv.revokedAt || null,
    revokedReason: inv.revokedReason || null,
    acceptUrl: inviteAcceptUrl(inv.token, req),
  };
}

const staffInvitations = [
  {
    id: 'inv_seed_1',
    token: 'tok_seed_pending_nomsa',
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    email: 'nomsa.k@littlestars.edu',
    phone: null,
    role: 'Teacher',
    invitedAt: '2026-04-14T11:00:00Z',
    invitedByEmail: 'admin@littlestars.edu',
    expiresAt: '2026-04-28T11:00:00Z',
    status: 'pending',
    lastResentAt: null,
    lastSentVia: 'email',
    acceptedAt: null,
    acceptedByName: null,
    revokedAt: null,
    revokedReason: null,
  },
  {
    id: 'inv_seed_2',
    token: 'tok_seed_accepted_thabo',
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    email: 'coach.t@example.com',
    phone: '+27821234567',
    role: 'Coach / instructor',
    invitedAt: '2026-04-10T09:30:00Z',
    invitedByEmail: 'admin@littlestars.edu',
    expiresAt: '2026-04-24T09:30:00Z',
    status: 'accepted',
    lastResentAt: null,
    lastSentVia: 'whatsapp',
    acceptedAt: '2026-04-11T08:15:00Z',
    acceptedByName: 'Thabo Mokoena',
    revokedAt: null,
    revokedReason: null,
  },
  {
    id: 'inv_seed_3',
    token: 'tok_seed_expired_auntie',
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    email: 'auntie.j@example.com',
    phone: null,
    role: 'Support',
    invitedAt: '2026-03-12T10:00:00Z',
    invitedByEmail: 'admin@littlestars.edu',
    expiresAt: '2026-03-26T10:00:00Z',
    status: 'expired',
    lastResentAt: null,
    lastSentVia: 'email',
    acceptedAt: null,
    acceptedByName: null,
    revokedAt: null,
    revokedReason: null,
  },
  {
    /**
     * Long-lived demo invite — handy for testing the /accept-invite flow.
     * Expires in the year 2099 so it never auto-expires during dev.
     */
    id: 'inv_seed_4',
    token: 'tok_seed_demo_open',
    institutionId: CURRENT_INSTITUTION.id,
    institutionName: CURRENT_INSTITUTION.name,
    email: 'demo.staff@littlestars.edu',
    phone: '+27831112233',
    role: 'Teacher',
    invitedAt: '2026-04-15T08:00:00Z',
    invitedByEmail: 'admin@littlestars.edu',
    expiresAt: '2099-01-01T00:00:00Z',
    status: 'pending',
    lastResentAt: null,
    lastSentVia: 'both',
    acceptedAt: null,
    acceptedByName: null,
    revokedAt: null,
    revokedReason: null,
  },
];

function recomputeStaffInvitationStatuses() {
  const now = Date.now();
  for (const inv of staffInvitations) {
    if (inv.status === 'pending' && Date.parse(inv.expiresAt) <= now) {
      inv.status = 'expired';
    }
  }
}

const documentsByTenant = {
  tenant_little_stars: [
    {
      id: 'tdoc_ls_1',
      tenantId: 'tenant_little_stars',
      title: 'Facility fire safety certificate',
      uploadedAt: '2026-03-01T10:00:00Z',
      status: 'indexed',
    },
  ],
  tenant_code_cubs: [
    {
      id: 'tdoc_cc_1',
      tenantId: 'tenant_code_cubs',
      title: 'Equipment insurance',
      uploadedAt: '2026-01-20T09:00:00Z',
      status: 'indexed',
    },
  ],
};

function send(res, status, body, contentType = 'application/json') {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (status === 204) {
    res.writeHead(204, headers);
    res.end();
    return;
  }
  headers['Content-Type'] = contentType;
  if (typeof body === 'string') {
    res.writeHead(status, headers);
    res.end(body);
  } else {
    res.writeHead(status, headers);
    res.end(JSON.stringify(body));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname.replace(/\/$/, '') || '/';

  try {
    if (req.method === 'GET' && path === '/api/platform/tenants') {
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') || '20')));
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const slugExact = (url.searchParams.get('slug') || '').trim().toLowerCase();
      const status = url.searchParams.get('status') || '';
      const plan = url.searchParams.get('plan') || '';
      let rows = [...tenants];
      if (status) rows = rows.filter((x) => x.status === status);
      if (plan) rows = rows.filter((x) => x.plan === plan);
      if (slugExact) rows = rows.filter((x) => String(x.slug).toLowerCase() === slugExact);
      if (search) {
        rows = rows.filter((x) =>
          [x.name, x.slug, x.type, x.plan, x.firstAdminEmail || '']
            .join(' ')
            .toLowerCase()
            .includes(search),
        );
      }
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize);
      send(res, 200, {
        items,
        totalCount,
        page,
        pageSize,
      });
      return;
    }

    if (req.method === 'GET' && /^\/api\/platform\/tenants\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/').pop());
      const t = tenants.find((x) => x.id === id);
      if (!t) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      send(res, 200, t);
      return;
    }

    if (req.method === 'POST' && path === '/api/platform/tenants/onboard') {
      const body = await readBody(req);
      const id = `tenant_${randomUUID().slice(0, 8)}`;
      const slug = String(body.slug || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
      if (tenants.some((x) => x.slug === slug)) {
        send(res, 409, { message: 'Slug already in use' });
        return;
      }
      const row = {
        id,
        name: String(body.name || 'New tenant').trim(),
        type: String(body.type || 'PRESCHOOL'),
        slug,
        plan: body.plan || 'starter',
        status: body.initialStatus || 'pending',
        timezone: String(body.timezone || 'UTC'),
        createdAt: new Date().toISOString(),
        firstAdminEmail: body.firstAdminEmail ?? null,
        firstAdminFirstName: body.firstAdminFirstName ?? null,
        firstAdminLastName: body.firstAdminLastName ?? null,
        onboardedByUserId: null,
        activatedAt: body.initialStatus === 'active' ? new Date().toISOString() : null,
        suspendedAt: null,
        maxChildren: null,
      };
      tenants = [...tenants, row];
      appendAudit({
        tenantId: row.id,
        tenantName: row.name,
        action: 'tenant.onboarded',
        detail: `Onboarded ${row.name} (${row.slug}) on plan ${row.plan}.`,
      });
      send(res, 200, {
        tenantId: id,
        slug: row.slug,
        status: row.status,
        createdAt: row.createdAt,
      });
      return;
    }

    if (req.method === 'PATCH' && /^\/api\/platform\/tenants\/[^/]+\/status$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[4]);
      const body = await readBody(req);
      const idx = tenants.findIndex((x) => x.id === id);
      if (idx < 0) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const next = body.status;
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (next === 'suspended' && !reason) {
        send(res, 400, { message: 'A reason is required when suspending.' });
        return;
      }
      const now = new Date().toISOString();
      const prev = tenants[idx];
      tenants[idx] = {
        ...prev,
        status: next,
        activatedAt: next === 'active' ? prev.activatedAt || now : prev.activatedAt,
        suspendedAt: next === 'suspended' ? now : prev.suspendedAt,
      };
      const action =
        next === 'active'
          ? 'tenant.activated'
          : next === 'suspended'
            ? 'tenant.suspended'
            : next === 'archived'
              ? 'tenant.archived'
              : 'tenant.status_changed';
      const detail =
        next === 'suspended'
          ? `Suspended (${prev.status} → ${next}). Reason: ${reason}.`
          : `Status ${prev.status} → ${next}.`;
      appendAudit({
        tenantId: prev.id,
        tenantName: prev.name,
        action,
        detail,
      });
      send(res, 204, '');
      return;
    }

    if (req.method === 'GET' && path === '/api/platform/users') {
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') || '20')));
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      let rows = [...users];
      if (search) {
        rows = rows.filter((x) =>
          [x.email, x.displayName, x.role, x.homeTenantName || '']
            .join(' ')
            .toLowerCase()
            .includes(search),
        );
      }
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize);
      send(res, 200, { items, totalCount, page, pageSize });
      return;
    }

    if (req.method === 'GET' && /^\/api\/platform\/users\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/').pop());
      const u = users.find((x) => x.id === id);
      if (!u) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      send(res, 200, u);
      return;
    }

    if (req.method === 'GET' && path === '/api/platform/audit') {
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') || '20')));
      const tenantId = url.searchParams.get('tenantId') || '';
      const noTenant = (url.searchParams.get('noTenant') || '').toLowerCase() === 'true';
      const action = url.searchParams.get('action') || '';
      const actor = (url.searchParams.get('actor') || '').trim().toLowerCase();
      let rows = [...audit];
      if (noTenant) rows = rows.filter((x) => x.tenantId === null);
      else if (tenantId) rows = rows.filter((x) => x.tenantId === tenantId);
      if (action) rows = rows.filter((x) => x.action === action);
      if (actor) rows = rows.filter((x) => String(x.actorEmail).toLowerCase().includes(actor));
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize);
      send(res, 200, { items, totalCount, page, pageSize });
      return;
    }

    if (req.method === 'GET' && /^\/api\/platform\/tenants\/[^/]+\/documents$/.test(path)) {
      const parts = path.split('/');
      const tenantId = decodeURIComponent(parts[4]);
      const all = documentsByTenant[tenantId] || [];
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') || '20')));
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const status = url.searchParams.get('status') || '';
      let rows = [...all];
      if (status) rows = rows.filter((x) => x.status === status);
      if (search) rows = rows.filter((x) => String(x.title).toLowerCase().includes(search));
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize);
      send(res, 200, { items, totalCount, page, pageSize });
      return;
    }

    if (req.method === 'GET' && /^\/api\/tenants\/by-slug\/[^/]+\/settings$/.test(path)) {
      const slug = decodeURIComponent(path.split('/')[4]);
      const t = tenants.find((x) => x.slug === slug);
      if (!t) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      send(res, 200, tenantToSettingsDto(t));
      return;
    }

    if (req.method === 'GET' && path === '/api/tenant/settings') {
      const slug = (url.searchParams.get('tenant') || '').trim().toLowerCase();
      const t = slug ? tenants.find((x) => x.slug === slug) : tenants.find((x) => x.status === 'active');
      if (!t) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      send(res, 200, tenantToSettingsDto(t));
      return;
    }

    if (req.method === 'GET' && /^\/api\/children\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      const row = children.find((c) => c.id === id);
      if (!row) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      send(res, 200, buildChildDetail(row));
      return;
    }

    if (req.method === 'POST' && path === '/api/children') {
      const body = await readBody(req);
      const displayName = String(body?.displayName || '').trim();
      const dateOfBirth = String(body?.dateOfBirth || '').trim();
      const guardians = Array.isArray(body?.guardians) ? body.guardians : [];
      if (!displayName) {
        send(res, 400, { code: 'VALIDATION', message: 'displayName is required.' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'dateOfBirth must be in YYYY-MM-DD format.',
        });
        return;
      }
      if (!guardians.length || guardians.some((g) => !String(g?.displayName || '').trim())) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'At least one guardian with a name is required.',
        });
        return;
      }
      const targetInstitution = resolveInstitution(body?.institutionId);
      if (!targetInstitution) {
        send(res, 400, {
          code: 'VALIDATION',
          message: `Unknown institutionId "${body.institutionId}".`,
        });
        return;
      }
      const subscribeToCurrent = targetInstitution.id === CURRENT_INSTITUTION.id;
      const initialState =
        body?.initialMembershipState === 'active' ? 'active' : 'pending';
      const createdAt = new Date().toISOString();
      const notes = body?.notes ? String(body.notes).trim() || null : null;
      const classroom = body?.classroom
        ? String(body.classroom).trim() || null
        : null;

      // Resolve (or auto-create) the parent identity from the first guardian
      // with an email so the staff-bypass path stays consistent with the
      // parent-driven flow.
      const primaryGuardian = guardians[0];
      const primaryEmail = primaryGuardian?.email
        ? String(primaryGuardian.email).trim().toLowerCase()
        : null;
      let parent = primaryEmail
        ? parents.find((p) => p.email.toLowerCase() === primaryEmail)
        : null;
      if (!parent) {
        parent = {
          id: `parent_${randomUUID().slice(0, 8)}`,
          displayName: String(primaryGuardian.displayName).trim(),
          email: primaryEmail || `${slugifyName(primaryGuardian.displayName)}@example.com`,
          phone: primaryGuardian?.phone
            ? String(primaryGuardian.phone).trim() || null
            : null,
          createdAt,
          children: [],
        };
        parents.push(parent);
      }

      const parentChild = {
        id: `pchild_${randomUUID().slice(0, 8)}`,
        displayName,
        dateOfBirth,
        notes,
        subscriptions: [],
      };
      parent.children.push(parentChild);

      const id = `child_${randomUUID().slice(0, 8)}`;
      const enrolledAtDate = createdAt.slice(0, 10);
      const events = [];
      if (initialState !== 'pending') {
        events.push(
          makeEvent(createdAt, 'enrolled', 'Subscribed via staff-bypass simulator.', {
            classroom,
          }),
        );
      }
      parentChild.subscriptions.push({
        id: nextPeriodId('staff'),
        institutionId: targetInstitution.id,
        institutionChildId: subscribeToCurrent ? id : undefined,
        state: initialState,
        enrolledAt: initialState === 'pending' ? null : enrolledAtDate,
        endedAt: null,
        endedReason: null,
        archivedAt: null,
        classroom,
        events,
      });

      // Only the current institution actually adds a row to its roster; if the
      // staff-bypass targets a sibling institution, no current-institution
      // child record exists for them yet.
      if (subscribeToCurrent) {
        children.push({
          id,
          displayName,
          dateOfBirth,
          guardianNames: guardians.map((g) => String(g.displayName).trim()),
          membershipState: initialState,
          parentId: parent.id,
          parentChildId: parentChild.id,
        });
      }

      send(res, 200, {
        childId: id,
        membershipState: subscribeToCurrent ? initialState : 'ended',
        institutionId: targetInstitution.id,
        createdAt,
      });
      return;
    }

    if (req.method === 'POST' && /^\/api\/children\/[^/]+\/skills$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      const row = children.find((c) => c.id === id);
      if (!row) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const body = await readBody(req);
      const skillName = String(body?.skillName || '').trim();
      const programName = String(body?.programName || '').trim();
      const occurredAt = String(body?.occurredAt || '').trim();
      const instructorEmail = String(body?.instructorEmail || '').trim();
      const instructorName = body?.instructorName
        ? String(body.instructorName).trim() || null
        : null;
      if (!skillName) {
        send(res, 400, { code: 'VALIDATION', message: 'skillName is required.' });
        return;
      }
      if (!programName) {
        send(res, 400, { code: 'VALIDATION', message: 'programName is required.' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'occurredAt must be in YYYY-MM-DD format.',
        });
        return;
      }
      if (!instructorEmail) {
        send(res, 400, { code: 'VALIDATION', message: 'instructorEmail is required.' });
        return;
      }
      const link = row.parentChildId ? findParentChild(row.parentChildId) : null;
      if (!link) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `Child "${id}" is not linked to a parent-child; cannot record a skill.`,
        });
        return;
      }
      const period = findOpenPeriod(link.child, CURRENT_INSTITUTION.id);
      if (!period) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `${link.child.displayName} has no open subscription at ${CURRENT_INSTITUTION.name}; re-enrol before logging skills.`,
        });
        return;
      }
      const event = makeEvent(
        `${occurredAt}T12:00:00Z`,
        'skill_earned',
        skillName,
        { skillName, programName, instructorEmail, instructorName },
        { email: instructorEmail, name: instructorName },
      );
      appendPeriodEvent(period, event);
      const entry = {
        id: event.id,
        skillName,
        programName,
        occurredAt,
        institutionId: CURRENT_INSTITUTION.id,
        institutionName: CURRENT_INSTITUTION.name,
        instructorEmail,
        instructorName,
      };
      send(res, 200, { entry });
      return;
    }

    if (
      req.method === 'PATCH' &&
      /^\/api\/children\/[^/]+\/membership-state$/.test(path)
    ) {
      const id = decodeURIComponent(path.split('/')[3]);
      const idx = children.findIndex((c) => c.id === id);
      if (idx < 0) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const body = await readBody(req);
      const next = String(body?.state || '').trim();
      const reason = String(body?.reason || '').trim();
      if (!['pending', 'active', 'paused', 'ended'].includes(next)) {
        send(res, 400, { code: 'VALIDATION', message: `Unknown state "${next}".` });
        return;
      }
      if ((next === 'paused' || next === 'ended') && !reason) {
        send(res, 400, {
          code: 'VALIDATION',
          message: `A reason is required to ${next === 'paused' ? 'pause' : 'end'} a membership.`,
        });
        return;
      }
      const prev = children[idx];
      const link = prev.parentChildId ? findParentChild(prev.parentChildId) : null;
      if (!link) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `Child "${id}" is not linked to a parent-child; cannot change membership.`,
        });
        return;
      }
      const nowIso = new Date().toISOString();
      const open = findOpenPeriod(link.child, CURRENT_INSTITUTION.id);
      const latest = findLatestPeriod(link.child, CURRENT_INSTITUTION.id);

      // Re-enrolment after ended → open a NEW period; never resurrect.
      if (!open && next === 'active') {
        const newPeriod = {
          id: nextPeriodId('reenrol'),
          institutionId: CURRENT_INSTITUTION.id,
          institutionChildId: id,
          state: 'active',
          enrolledAt: nowIso.slice(0, 10),
          endedAt: null,
          endedReason: null,
          archivedAt: null,
          classroom: latest?.classroom ?? null,
          events: [
            makeEvent(nowIso, 'enrolled', `Re-enrolled at ${CURRENT_INSTITUTION.name}.`, {
              classroom: latest?.classroom ?? null,
              priorPeriodId: latest?.id ?? null,
            }),
          ],
        };
        link.child.subscriptions.push(newPeriod);
        children[idx] = { ...prev, membershipState: 'active' };
        send(res, 204, '');
        return;
      }
      if (!open) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `${link.child.displayName} has no open subscription at ${CURRENT_INSTITUTION.name}; re-enrol first.`,
        });
        return;
      }
      const from = open.state;
      if (from === next) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `Subscription is already ${next}.`,
        });
        return;
      }
      const kind =
        next === 'ended'
          ? 'ended'
          : next === 'paused'
            ? 'paused'
            : from === 'paused' && next === 'active'
              ? 'resumed'
              : from === 'pending' && next === 'active'
                ? 'enrolled'
                : 'state_change';
      const summary =
        kind === 'ended'
          ? 'Period ended.'
          : kind === 'paused'
            ? 'Period paused.'
            : kind === 'resumed'
              ? 'Period resumed.'
              : kind === 'enrolled'
                ? 'Enrolment approved.'
                : `State changed: ${from} → ${next}.`;
      appendPeriodEvent(
        open,
        makeEvent(nowIso, kind, summary, { from, to: next, reason: reason || null }),
      );
      open.state = next;
      if (next === 'active' && !open.enrolledAt) {
        open.enrolledAt = nowIso.slice(0, 10);
      }
      if (next === 'ended') {
        open.endedAt = nowIso.slice(0, 10);
        open.endedReason = reason || null;
      }
      children[idx] = { ...prev, membershipState: next };
      send(res, 204, '');
      return;
    }

    if (req.method === 'GET' && path === '/api/children') {
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') || '20')));
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const membershipState = (url.searchParams.get('membershipState') || '').trim();
      let rows = [...children].map((c) => {
        const link = c.parentChildId ? findParentChild(c.parentChildId) : null;
        const others = otherSubscriptionsForParentChild(link?.child);
        return { ...c, otherSubscriptionsCount: others.length };
      });
      if (membershipState) {
        rows = rows.filter((c) => c.membershipState === membershipState);
      }
      if (search) {
        rows = rows.filter((c) =>
          [c.displayName, ...c.guardianNames].join(' ').toLowerCase().includes(search),
        );
      }
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize);
      send(res, 200, { items, totalCount, page, pageSize });
      return;
    }

    if (req.method === 'POST' && path === '/api/subscription-requests') {
      const body = await readBody(req);
      const institutionId = String(body?.institutionId || '').trim();
      const parentId = String(body?.parentId || '').trim();
      const parentChildId = String(body?.parentChildId || '').trim();
      const target = resolveInstitution(institutionId);
      if (!institutionId || !target) {
        send(res, 400, {
          code: 'VALIDATION',
          message: `Unknown or missing institutionId "${institutionId}".`,
        });
        return;
      }
      const parent = parents.find((p) => p.id === parentId);
      if (!parent) {
        send(res, 400, {
          code: 'VALIDATION',
          message: `Unknown parentId "${parentId}".`,
        });
        return;
      }
      const parentChild = parent.children.find((c) => c.id === parentChildId);
      if (!parentChild) {
        send(res, 400, {
          code: 'VALIDATION',
          message: `parentChildId "${parentChildId}" does not belong to parent "${parentId}".`,
        });
        return;
      }
      // Re-subscription after an `ended` period is allowed — it'll create a
      // new period on approval. Only an *open* period blocks a new request.
      const open = findOpenPeriod(parentChild, target.id);
      if (open) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `${parentChild.displayName} already has a ${open.state} subscription at ${target.name}.`,
        });
        return;
      }
      const latest = findLatestPeriod(parentChild, target.id);
      const requestId = `sr_${randomUUID().slice(0, 8)}`;
      const receivedAt = new Date().toISOString();
      // Only stash requests targeted at the current institution — otherwise
      // they "live" in another institution's inbox we don't expose.
      if (target.id === CURRENT_INSTITUTION.id) {
        subscriptionRequests.unshift({
          id: requestId,
          institutionId: target.id,
          institutionName: target.name,
          parentId: parent.id,
          parentChildId: parentChild.id,
          institutionChildId: latest?.institutionChildId ?? null,
          childDisplayName: parentChild.displayName,
          childDateOfBirth: parentChild.dateOfBirth,
          parentEmail: parent.email,
          parentDisplayName: parent.displayName,
          message: body?.message ? String(body.message).trim() || null : null,
          classroomRequested: body?.classroomRequested
            ? String(body.classroomRequested).trim() || null
            : null,
          requestedAt: receivedAt,
          status: 'pending',
          resolvedChildId: null,
          rejectionReason: null,
          resolvedAt: null,
          resolvedByEmail: null,
        });
      }
      send(res, 200, {
        requestId,
        receivedAt,
        institutionId: target.id,
        institutionName: target.name,
      });
      return;
    }

    if (req.method === 'GET' && path === '/api/subscription-requests') {
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(500, Math.max(1, Number(url.searchParams.get('pageSize') || '20')));
      const status = (url.searchParams.get('status') || '').trim();
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      let rows = [...subscriptionRequests];
      if (status) rows = rows.filter((r) => r.status === status);
      if (search) {
        rows = rows.filter((r) =>
          `${r.childDisplayName} ${r.parentEmail} ${r.parentDisplayName ?? ''}`
            .toLowerCase()
            .includes(search),
        );
      }
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize);
      send(res, 200, { items, totalCount, page, pageSize });
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/subscription-requests\/[^/]+\/approve$/.test(path)
    ) {
      const id = decodeURIComponent(path.split('/')[3]);
      const idx = subscriptionRequests.findIndex((r) => r.id === id);
      if (idx < 0) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const req0 = subscriptionRequests[idx];
      if (req0.status !== 'pending') {
        send(res, 409, {
          code: 'CONFLICT',
          message: `Request "${id}" is already ${req0.status}.`,
        });
        return;
      }
      const body = await readBody(req);
      const overrideClassroom = body?.classroom
        ? String(body.classroom).trim() || null
        : null;
      const approvedAt = new Date().toISOString();
      const link = findParentChild(req0.parentChildId);
      if (!link) {
        send(res, 500, {
          message: `Could not resolve parent-child "${req0.parentChildId}" linked to request "${req0.id}".`,
        });
        return;
      }
      const { parent, child: parentChild } = link;

      // If there's an open period (e.g. `pending` from the parent submission),
      // approve into it. Otherwise (prior period ended, or none) open a NEW
      // period so the prior period's events stay sealed and archivable.
      const open = findOpenPeriod(parentChild, CURRENT_INSTITUTION.id);
      const latest = findLatestPeriod(parentChild, CURRENT_INSTITUTION.id);
      const childId =
        req0.institutionChildId ||
        open?.institutionChildId ||
        latest?.institutionChildId ||
        `child_${randomUUID().slice(0, 8)}`;
      const classroom = overrideClassroom || req0.classroomRequested || null;

      const enrolledEvent = makeEvent(
        approvedAt,
        'enrolled',
        'Subscription approved by staff.',
        { classroom, requestId: req0.id },
      );

      let activePeriod;
      if (open) {
        open.state = 'active';
        open.enrolledAt = approvedAt.slice(0, 10);
        open.classroom = classroom;
        open.institutionChildId = childId;
        appendPeriodEvent(open, enrolledEvent);
        activePeriod = open;
      } else {
        activePeriod = {
          id: nextPeriodId('approve'),
          institutionId: CURRENT_INSTITUTION.id,
          institutionChildId: childId,
          state: 'active',
          enrolledAt: approvedAt.slice(0, 10),
          endedAt: null,
          endedReason: null,
          archivedAt: null,
          classroom,
          events: [enrolledEvent],
        };
        parentChild.subscriptions.push(activePeriod);
      }

      let row = children.find((c) => c.id === childId);
      if (!row) {
        row = {
          id: childId,
          displayName: parentChild.displayName,
          dateOfBirth: parentChild.dateOfBirth,
          guardianNames: [parent.displayName],
          membershipState: 'active',
          parentId: parent.id,
          parentChildId: parentChild.id,
        };
        children.push(row);
      } else {
        row.membershipState = 'active';
      }

      subscriptionRequests[idx] = {
        ...req0,
        status: 'approved',
        institutionChildId: childId,
        resolvedChildId: childId,
        resolvedAt: approvedAt,
        resolvedByEmail: 'admin@example.com',
      };
      send(res, 200, {
        childId,
        subscriptionId: activePeriod.id,
        approvedAt,
      });
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/subscription-requests\/[^/]+\/reject$/.test(path)
    ) {
      const id = decodeURIComponent(path.split('/')[3]);
      const idx = subscriptionRequests.findIndex((r) => r.id === id);
      if (idx < 0) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const req0 = subscriptionRequests[idx];
      if (req0.status !== 'pending') {
        send(res, 409, {
          code: 'CONFLICT',
          message: `Request "${id}" is already ${req0.status}.`,
        });
        return;
      }
      const body = await readBody(req);
      const reason = String(body?.reason || '').trim();
      if (!reason) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'A rejection reason is required.',
        });
        return;
      }
      subscriptionRequests[idx] = {
        ...req0,
        status: 'rejected',
        rejectionReason: reason,
        resolvedAt: new Date().toISOString(),
        resolvedByEmail: 'admin@example.com',
      };
      send(res, 204, '');
      return;
    }

    // ----- Parents (parent-app surface, also exposed for the simulator) -----

    if (req.method === 'GET' && path === '/api/parents') {
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(
        500,
        Math.max(1, Number(url.searchParams.get('pageSize') || '50')),
      );
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      let rows = [...parents];
      if (search) {
        rows = rows.filter((p) =>
          `${p.displayName} ${p.email}`.toLowerCase().includes(search),
        );
      }
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize).map(parentToDto);
      send(res, 200, { items, totalCount, page, pageSize });
      return;
    }

    if (req.method === 'GET' && /^\/api\/parents\/[^/]+$/.test(path)) {
      const id = decodeURIComponent(path.split('/')[3]);
      const p = parents.find((x) => x.id === id);
      if (!p) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      send(res, 200, parentToDto(p));
      return;
    }

    if (req.method === 'POST' && path === '/api/parents') {
      const body = await readBody(req);
      const displayName = String(body?.displayName || '').trim();
      const email = String(body?.email || '').trim();
      const phone = body?.phone ? String(body.phone).trim() || null : null;
      if (!displayName) {
        send(res, 400, { code: 'VALIDATION', message: 'displayName is required.' });
        return;
      }
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'A valid email is required.',
        });
        return;
      }
      if (parents.some((p) => p.email.toLowerCase() === email.toLowerCase())) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `A parent with email "${email}" already exists.`,
        });
        return;
      }
      const seedChildren = Array.isArray(body?.children) ? body.children : [];
      for (const c of seedChildren) {
        if (!String(c?.displayName || '').trim()) {
          send(res, 400, {
            code: 'VALIDATION',
            message: 'Each onboarding child requires a displayName.',
          });
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c?.dateOfBirth || ''))) {
          send(res, 400, {
            code: 'VALIDATION',
            message: 'Each onboarding child requires dateOfBirth in YYYY-MM-DD format.',
          });
          return;
        }
      }
      const id = `parent_${randomUUID().slice(0, 8)}`;
      const createdAt = new Date().toISOString();
      const parent = {
        id,
        displayName,
        email,
        phone,
        createdAt,
        children: seedChildren.map((c) => ({
          id: `pchild_${randomUUID().slice(0, 8)}`,
          displayName: String(c.displayName).trim(),
          dateOfBirth: String(c.dateOfBirth).trim(),
          notes: c?.notes ? String(c.notes).trim() || null : null,
          photoUrl: typeof c?.photoUrl === 'string' && c.photoUrl ? c.photoUrl : null,
          subscriptions: [],
        })),
      };
      parents.push(parent);
      send(res, 200, { parent: parentToDto(parent) });
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/parents\/[^/]+\/children\/[^/]+\/subscriptions\/[^/]+\/archive$/.test(
        path,
      )
    ) {
      const parts = path.split('/');
      const parentId = decodeURIComponent(parts[3]);
      const parentChildId = decodeURIComponent(parts[5]);
      const subscriptionId = decodeURIComponent(parts[7]);
      const parent = parents.find((p) => p.id === parentId);
      const parentChild = parent?.children.find((c) => c.id === parentChildId);
      const period = parentChild?.subscriptions.find((s) => s.id === subscriptionId);
      if (!parent || !parentChild || !period) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      if (period.state !== 'ended') {
        send(res, 409, {
          code: 'CONFLICT',
          message: 'Only ended subscription periods can be archived.',
        });
        return;
      }
      // Idempotent: don't overwrite an existing archive timestamp; just return
      // the snapshot. New archives are stamped now.
      if (!period.archivedAt) {
        period.archivedAt = new Date().toISOString();
      }
      const snapshot = buildArchiveSnapshot(parent, parentChild, [period]);
      send(res, 200, snapshot);
      return;
    }

    if (
      req.method === 'GET' &&
      /^\/api\/parents\/[^/]+\/children\/[^/]+\/archive$/.test(path)
    ) {
      const parts = path.split('/');
      const parentId = decodeURIComponent(parts[3]);
      const parentChildId = decodeURIComponent(parts[5]);
      const parent = parents.find((p) => p.id === parentId);
      const parentChild = parent?.children.find((c) => c.id === parentChildId);
      if (!parent || !parentChild) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      // Full lifetime: include every period, sealed or open. The parent might
      // download this for their own records at any time.
      const snapshot = buildArchiveSnapshot(
        parent,
        parentChild,
        [...parentChild.subscriptions],
      );
      send(res, 200, snapshot);
      return;
    }

    // GET /api/parents/{pid}/children/{pcid}/memories
    if (
      req.method === 'GET' &&
      /^\/api\/parents\/[^/]+\/children\/[^/]+\/memories$/.test(path)
    ) {
      const parts = path.split('/');
      const parentId = decodeURIComponent(parts[3]);
      const parentChildId = decodeURIComponent(parts[5]);
      const parent = parents.find((p) => p.id === parentId);
      const parentChild = parent?.children.find((c) => c.id === parentChildId);
      if (!parent || !parentChild) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const rows = (parentChild.memories || [])
        .slice()
        .sort((a, b) =>
          a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0,
        )
        .map((m) => memoryToDto(m, parentChild.id));
      send(res, 200, rows);
      return;
    }

    // POST /api/parents/{pid}/children/{pcid}/memories
    if (
      req.method === 'POST' &&
      /^\/api\/parents\/[^/]+\/children\/[^/]+\/memories$/.test(path)
    ) {
      const parts = path.split('/');
      const parentId = decodeURIComponent(parts[3]);
      const parentChildId = decodeURIComponent(parts[5]);
      const parent = parents.find((p) => p.id === parentId);
      const parentChild = parent?.children.find((c) => c.id === parentChildId);
      if (!parent || !parentChild) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const body = await readBody(req);
      const url = typeof body?.url === 'string' ? body.url : '';
      const occurredAt = String(body?.occurredAt || '').trim();
      if (!url) {
        send(res, 400, { code: 'VALIDATION', message: 'url is required.' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredAt)) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'occurredAt must be a YYYY-MM-DD date.',
        });
        return;
      }
      const memory = {
        id: `mem_${randomUUID().slice(0, 8)}`,
        kind: body?.kind === 'video' ? 'video' : 'photo',
        url,
        caption:
          typeof body?.caption === 'string' && body.caption.trim()
            ? body.caption.trim()
            : null,
        occurredAt,
        createdAt: new Date().toISOString(),
        tag:
          typeof body?.tag === 'string' && body.tag.trim()
            ? body.tag.trim()
            : null,
        institutionId:
          typeof body?.institutionId === 'string' && body.institutionId
            ? body.institutionId
            : null,
      };
      if (!Array.isArray(parentChild.memories)) parentChild.memories = [];
      parentChild.memories.unshift(memory);
      send(res, 200, memoryToDto(memory, parentChild.id));
      return;
    }

    // DELETE /api/parents/{pid}/children/{pcid}/memories/{mid}
    if (
      req.method === 'DELETE' &&
      /^\/api\/parents\/[^/]+\/children\/[^/]+\/memories\/[^/]+$/.test(path)
    ) {
      const parts = path.split('/');
      const parentId = decodeURIComponent(parts[3]);
      const parentChildId = decodeURIComponent(parts[5]);
      const memoryId = decodeURIComponent(parts[7]);
      const parent = parents.find((p) => p.id === parentId);
      const parentChild = parent?.children.find((c) => c.id === parentChildId);
      if (!parent || !parentChild) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      parentChild.memories = (parentChild.memories || []).filter(
        (m) => m.id !== memoryId,
      );
      send(res, 204, {});
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/parents\/[^/]+\/children$/.test(path)
    ) {
      const id = decodeURIComponent(path.split('/')[3]);
      const parent = parents.find((x) => x.id === id);
      if (!parent) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const body = await readBody(req);
      const displayName = String(body?.displayName || '').trim();
      const dateOfBirth = String(body?.dateOfBirth || '').trim();
      const notes = body?.notes ? String(body.notes).trim() || null : null;
      if (!displayName) {
        send(res, 400, { code: 'VALIDATION', message: 'displayName is required.' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'dateOfBirth must be in YYYY-MM-DD format.',
        });
        return;
      }
      const photoUrl =
        typeof body?.photoUrl === 'string' && body.photoUrl ? body.photoUrl : null;
      const child = {
        id: `pchild_${randomUUID().slice(0, 8)}`,
        displayName,
        dateOfBirth,
        notes,
        photoUrl,
        subscriptions: [],
      };
      parent.children.push(child);
      send(res, 200, {
        child: {
          id: child.id,
          displayName: child.displayName,
          dateOfBirth: child.dateOfBirth,
          notes: child.notes,
          photoUrl: child.photoUrl,
        },
      });
      return;
    }

    // ----- Staff invitations (institution-side) -----

    if (req.method === 'GET' && path === '/api/staff-invitations') {
      recomputeStaffInvitationStatuses();
      const status = url.searchParams.get('status') || '';
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
      const pageSize = Math.min(
        500,
        Math.max(1, Number(url.searchParams.get('pageSize') || '20')),
      );
      let rows = staffInvitations.filter(
        (i) => i.institutionId === CURRENT_INSTITUTION.id,
      );
      const totalsByStatus = { pending: 0, accepted: 0, expired: 0, revoked: 0 };
      for (const r of rows) totalsByStatus[r.status]++;
      if (status) rows = rows.filter((r) => r.status === status);
      if (search) {
        rows = rows.filter((r) =>
          `${r.email} ${r.role}`.toLowerCase().includes(search),
        );
      }
      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows
        .slice(start, start + pageSize)
        .map((r) => staffInvitationToDto(r, req));
      send(res, 200, { items, totalCount, page, pageSize, totalsByStatus });
      return;
    }

    if (req.method === 'POST' && path === '/api/staff-invitations') {
      recomputeStaffInvitationStatuses();
      const body = await readBody(req);
      const email = String(body?.email || '').trim().toLowerCase();
      const role = String(body?.role || '').trim();
      const phone = body?.phone ? String(body.phone).trim() || null : null;
      const sendVia = ['email', 'whatsapp', 'both'].includes(body?.sendVia)
        ? body.sendVia
        : 'email';
      const expiresInDays = Math.min(
        90,
        Math.max(1, Number(body?.expiresInDays || 14)),
      );
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'A valid email is required.',
        });
        return;
      }
      if (!role) {
        send(res, 400, { code: 'VALIDATION', message: 'role is required.' });
        return;
      }
      if ((sendVia === 'whatsapp' || sendVia === 'both') && !phone) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'phone is required to send via WhatsApp.',
        });
        return;
      }
      const dup = staffInvitations.find(
        (i) =>
          i.institutionId === CURRENT_INSTITUTION.id &&
          i.email.toLowerCase() === email &&
          i.status === 'pending',
      );
      if (dup) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `A pending invitation to "${email}" already exists.`,
        });
        return;
      }
      const now = new Date();
      const invitation = {
        id: `inv_${randomUUID().slice(0, 8)}`,
        token: generateInviteToken(),
        institutionId: CURRENT_INSTITUTION.id,
        institutionName: CURRENT_INSTITUTION.name,
        email,
        phone,
        role,
        invitedAt: now.toISOString(),
        invitedByEmail: 'admin@littlestars.edu',
        expiresAt: new Date(
          now.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
        ).toISOString(),
        status: 'pending',
        lastResentAt: null,
        lastSentVia: sendVia,
        acceptedAt: null,
        acceptedByName: null,
        revokedAt: null,
        revokedReason: null,
      };
      staffInvitations.unshift(invitation);
      appendAudit({
        actorEmail: invitation.invitedByEmail,
        tenantId: invitation.institutionId,
        tenantName: invitation.institutionName,
        action: 'staff_invitation.created',
        detail: `Invited ${invitation.email} as ${invitation.role} via ${sendVia}.`,
      });
      send(res, 200, { invitation: staffInvitationToDto(invitation, req) });
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/staff-invitations\/[^/]+\/resend$/.test(path)
    ) {
      recomputeStaffInvitationStatuses();
      const id = decodeURIComponent(path.split('/')[3]);
      const inv = staffInvitations.find(
        (i) => i.id === id && i.institutionId === CURRENT_INSTITUTION.id,
      );
      if (!inv) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      if (inv.status !== 'pending') {
        send(res, 409, {
          code: 'CONFLICT',
          message: `Cannot resend a ${inv.status} invitation.`,
        });
        return;
      }
      const body = await readBody(req);
      const requestedVia = body && body.sendVia;
      const via = ['email', 'whatsapp', 'both'].includes(requestedVia)
        ? requestedVia
        : inv.lastSentVia || 'email';
      if ((via === 'whatsapp' || via === 'both') && !inv.phone) {
        send(res, 400, {
          code: 'VALIDATION',
          message:
            'A WhatsApp/SMS number is required on this invitation to resend via WhatsApp.',
        });
        return;
      }
      const now = new Date();
      inv.lastResentAt = now.toISOString();
      inv.lastSentVia = via;
      inv.expiresAt = new Date(
        now.getTime() + 14 * 24 * 60 * 60 * 1000,
      ).toISOString();
      appendAudit({
        actorEmail: inv.invitedByEmail,
        tenantId: inv.institutionId,
        tenantName: inv.institutionName,
        action: 'staff_invitation.resent',
        detail: `Resent invitation to ${inv.email} via ${via}.`,
      });
      send(res, 200, {
        resentAt: inv.lastResentAt,
        expiresAt: inv.expiresAt,
        via,
      });
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/staff-invitations\/[^/]+\/revoke$/.test(path)
    ) {
      recomputeStaffInvitationStatuses();
      const id = decodeURIComponent(path.split('/')[3]);
      const body = await readBody(req);
      const reason = String(body?.reason || '').trim();
      if (!reason) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'A revocation reason is required.',
        });
        return;
      }
      const inv = staffInvitations.find(
        (i) => i.id === id && i.institutionId === CURRENT_INSTITUTION.id,
      );
      if (!inv) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      if (inv.status !== 'pending') {
        send(res, 409, {
          code: 'CONFLICT',
          message: `Cannot revoke a ${inv.status} invitation.`,
        });
        return;
      }
      inv.status = 'revoked';
      inv.revokedAt = new Date().toISOString();
      inv.revokedReason = reason;
      appendAudit({
        actorEmail: inv.invitedByEmail,
        tenantId: inv.institutionId,
        tenantName: inv.institutionName,
        action: 'staff_invitation.revoked',
        detail: `Revoked invitation to ${inv.email}: ${reason}`,
      });
      send(res, 204, '');
      return;
    }

    /* ------------------------------------------------------------------ */
    /* Public: look up + accept a staff invitation by its one-shot token  */
    /* ------------------------------------------------------------------ */

    if (
      req.method === 'GET' &&
      /^\/api\/staff-invitations\/lookup\/[^/]+$/.test(path)
    ) {
      recomputeStaffInvitationStatuses();
      const token = decodeURIComponent(path.split('/').pop());
      const inv = staffInvitations.find((i) => i.token === token);
      if (!inv) {
        send(res, 404, {
          code: 'NOT_FOUND',
          message: 'This invitation link is not valid.',
        });
        return;
      }
      if (inv.status === 'expired') {
        send(res, 410, {
          code: 'GONE',
          message: 'This invitation has expired. Please ask your institution to resend it.',
        });
        return;
      }
      if (inv.status === 'revoked') {
        send(res, 410, {
          code: 'GONE',
          message: 'This invitation was cancelled by your institution.',
        });
        return;
      }
      if (inv.status === 'accepted') {
        send(res, 409, {
          code: 'CONFLICT',
          message: 'This invitation has already been redeemed. Please sign in instead.',
        });
        return;
      }
      send(res, 200, {
        id: inv.id,
        institutionId: inv.institutionId,
        institutionName: inv.institutionName,
        email: inv.email,
        role: inv.role,
        invitedByEmail: inv.invitedByEmail,
        expiresAt: inv.expiresAt,
        status: inv.status,
      });
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/staff-invitations\/lookup\/[^/]+\/accept$/.test(path)
    ) {
      recomputeStaffInvitationStatuses();
      const token = decodeURIComponent(path.split('/')[4]);
      const inv = staffInvitations.find((i) => i.token === token);
      if (!inv) {
        send(res, 404, { code: 'NOT_FOUND', message: 'Invalid invitation link.' });
        return;
      }
      if (inv.status === 'expired' || inv.status === 'revoked') {
        send(res, 410, {
          code: 'GONE',
          message: `This invitation is ${inv.status} and can no longer be accepted.`,
        });
        return;
      }
      if (inv.status === 'accepted') {
        send(res, 409, {
          code: 'CONFLICT',
          message: 'This invitation has already been redeemed.',
        });
        return;
      }
      const body = await readBody(req);
      const displayName = String(body?.displayName || '').trim();
      const password = String(body?.password || '');
      const phone = body?.phone ? String(body.phone).trim() || null : inv.phone;
      if (!displayName) {
        send(res, 400, { code: 'VALIDATION', message: 'displayName is required.' });
        return;
      }
      if (!password || password.length < 6) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'password must be at least 6 characters.',
        });
        return;
      }
      if (findAccountByEmail(inv.email)) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `An account with email "${inv.email}" already exists. Please sign in instead.`,
        });
        return;
      }
      const createdAt = new Date().toISOString();
      const accountId = `acct_${randomUUID().slice(0, 8)}`;
      const account = {
        id: accountId,
        role: 'staff',
        email: inv.email,
        password,
        displayName,
        phone,
        createdAt,
        staffInstitutionId: inv.institutionId,
        staffAssignedProgramIds: [],
      };
      accounts.push(account);
      inv.status = 'accepted';
      inv.acceptedAt = createdAt;
      inv.acceptedByName = displayName;
      appendAudit({
        actorEmail: inv.email,
        tenantId: inv.institutionId,
        tenantName: inv.institutionName,
        action: 'staff_invitation.accepted',
        detail: `${displayName} (${inv.email}) joined as ${inv.role}.`,
      });
      const session = issueSession(accountId);
      send(res, 200, {
        account: accountToDto(account),
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      });
      return;
    }

    if (req.method === 'GET' && /^\/api\/tenants\/by-slug\/[^/]+\/public$/.test(path)) {
      const slug = decodeURIComponent(path.split('/')[4]);
      const t = tenants.find((x) => x.slug === slug);
      if (!t) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      send(res, 200, {
        id: t.id,
        name: t.name,
        slug: t.slug,
        branding: {
          displayName: t.name,
          primaryColor: '#1e3a5f',
          accentColor: '#f59e0b',
          logoUrl: null,
        },
      });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* External-client: accounts (register / login / me / logout)          */
    /* ------------------------------------------------------------------ */

    if (req.method === 'POST' && path === '/api/accounts/register') {
      const body = await readBody(req);
      const role = String(body?.role || '').trim();
      const email = String(body?.email || '').trim();
      const password = String(body?.password || '');
      const displayName = String(body?.displayName || '').trim();
      const phone = body?.phone ? String(body.phone).trim() || null : null;

      if (role !== 'parent') {
        // Staff accounts can only be minted by redeeming a one-shot invite
        // token at /api/staff-invitations/lookup/{token}/accept. Open
        // self-signup as staff is no longer permitted.
        send(res, 403, {
          code: 'FORBIDDEN',
          message:
            'Staff accounts can only be created from an institution invite link. Ask your institution to send you one.',
        });
        return;
      }
      if (!displayName) {
        send(res, 400, { code: 'VALIDATION', message: 'displayName is required.' });
        return;
      }
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        send(res, 400, { code: 'VALIDATION', message: 'A valid email is required.' });
        return;
      }
      if (!password || password.length < 6) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'password must be at least 6 characters.',
        });
        return;
      }
      if (findAccountByEmail(email)) {
        send(res, 409, {
          code: 'CONFLICT',
          message: `An account with email "${email}" already exists.`,
        });
        return;
      }

      const createdAt = new Date().toISOString();
      const accountId = `acct_${randomUUID().slice(0, 8)}`;
      const account = {
        id: accountId,
        role,
        email,
        password,
        displayName,
        phone,
        createdAt,
      };

      // Only `role === 'parent'` reaches this point — staff signup has been
      // gated above and now lives behind /api/staff-invitations.
      let parent = parents.find((p) => p.email.toLowerCase() === email.toLowerCase());
      if (!parent) {
        parent = {
          id: `parent_${randomUUID().slice(0, 8)}`,
          displayName,
          email,
          phone,
          createdAt,
          children: [],
        };
        parents.push(parent);
      }
      account.parentId = parent.id;

      accounts.push(account);
      const session = issueSession(accountId);
      send(res, 200, {
        account: accountToDto(account),
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/accounts/login') {
      const body = await readBody(req);
      const email = String(body?.email || '').trim();
      const password = String(body?.password || '');
      if (!email || !password) {
        send(res, 400, { code: 'VALIDATION', message: 'email and password are required.' });
        return;
      }
      const account = findAccountByEmail(email);
      if (!account || account.password !== password) {
        send(res, 401, {
          code: 'UNAUTHENTICATED',
          message: 'Invalid email or password.',
        });
        return;
      }
      const session = issueSession(account.id);
      send(res, 200, {
        account: accountToDto(account),
        sessionToken: session.token,
        expiresAt: session.expiresAt,
      });
      return;
    }

    if (req.method === 'POST' && path === '/api/accounts/logout') {
      const token = bearerToken(req);
      if (token) revokeSession(token);
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && path === '/api/accounts/me') {
      const auth = authenticate(req);
      if (auth.error) {
        send(res, auth.error.status, auth.error.body);
        return;
      }
      send(res, 200, { account: accountToDto(auth.account) });
      return;
    }

    /* ------------------------------------------------------------------ */
    /* Daily reports                                                       */
    /* ------------------------------------------------------------------ */

    if (req.method === 'GET' && path === '/api/daily-reports') {
      const auth = authenticate(req);
      if (auth.error) {
        send(res, auth.error.status, auth.error.body);
        return;
      }
      const account = auth.account;
      const params = url.searchParams;
      const page = Math.max(1, Number(params.get('page') || '1'));
      const pageSize = Math.min(
        200,
        Math.max(1, Number(params.get('pageSize') || '50')),
      );

      let rows = [...dailyReports];

      // Role scoping: parents can only see their own kids' published reports;
      // staff can only see their institution's reports.
      if (account.role === 'parent') {
        rows = rows.filter(
          (r) => r.parentId === account.parentId && r.status === 'published',
        );
      } else if (account.role === 'staff') {
        rows = rows.filter((r) => r.institutionId === account.staffInstitutionId);
      }

      const parentChildId = params.get('parentChildId');
      if (parentChildId) rows = rows.filter((r) => r.parentChildId === parentChildId);
      const programId = params.get('programId');
      if (programId) rows = rows.filter((r) => r.programId === programId);
      const institutionId = params.get('institutionId');
      if (institutionId && account.role !== 'staff') {
        // Parents can scope to a specific institution; staff already had it forced above.
        rows = rows.filter((r) => r.institutionId === institutionId);
      }
      const status = params.get('status');
      if (status) rows = rows.filter((r) => r.status === status);
      const date = params.get('date');
      if (date) rows = rows.filter((r) => r.reportDate === date);
      const fromDate = params.get('fromDate');
      if (fromDate) rows = rows.filter((r) => r.reportDate >= fromDate);

      rows.sort((a, b) => {
        if (a.reportDate !== b.reportDate)
          return a.reportDate < b.reportDate ? 1 : -1;
        return a.postedAt < b.postedAt ? 1 : -1;
      });

      const totalCount = rows.length;
      const start = (page - 1) * pageSize;
      const items = rows.slice(start, start + pageSize).map(dailyReportToDto);
      send(res, 200, { items, totalCount, page, pageSize });
      return;
    }

    if (req.method === 'GET' && /^\/api\/daily-reports\/[^/]+$/.test(path)) {
      const auth = authenticate(req);
      if (auth.error) {
        send(res, auth.error.status, auth.error.body);
        return;
      }
      const id = decodeURIComponent(path.split('/')[3]);
      const r = dailyReports.find((x) => x.id === id);
      if (!r) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      const account = auth.account;
      if (account.role === 'parent') {
        if (r.parentId !== account.parentId || r.status !== 'published') {
          send(res, 404, { message: 'Not found' });
          return;
        }
      } else if (account.role === 'staff') {
        if (r.institutionId !== account.staffInstitutionId) {
          send(res, 404, { message: 'Not found' });
          return;
        }
      }
      send(res, 200, dailyReportToDto(r));
      return;
    }

    if (req.method === 'POST' && path === '/api/daily-reports') {
      const auth = authenticate(req);
      if (auth.error) {
        send(res, auth.error.status, auth.error.body);
        return;
      }
      const account = auth.account;
      if (account.role !== 'staff') {
        send(res, 403, { code: 'FORBIDDEN', message: 'Only staff can post daily reports.' });
        return;
      }
      const body = await readBody(req);
      const parentChildId = String(body?.parentChildId || '').trim();
      const institutionId = String(body?.institutionId || '').trim();
      const summary = String(body?.summary || '').trim();
      const reportDate = String(body?.reportDate || '').trim() ||
        new Date().toISOString().slice(0, 10);
      const programId = body?.programId ? String(body.programId).trim() || null : null;
      const mood = body?.mood ?? null;
      const highlights = body?.highlights ? String(body.highlights).trim() || null : null;
      const concerns = body?.concerns ? String(body.concerns).trim() || null : null;
      const publish = !!body?.publish;

      if (!parentChildId) {
        send(res, 400, { code: 'VALIDATION', message: 'parentChildId is required.' });
        return;
      }
      if (!institutionId) {
        send(res, 400, { code: 'VALIDATION', message: 'institutionId is required.' });
        return;
      }
      if (institutionId !== account.staffInstitutionId) {
        send(res, 403, {
          code: 'FORBIDDEN',
          message: 'You can only post reports under your own institution.',
        });
        return;
      }
      if (!findParentChild(parentChildId)) {
        send(res, 404, { code: 'NOT_FOUND', message: `No child with id "${parentChildId}".` });
        return;
      }
      if (!summary) {
        send(res, 400, { code: 'VALIDATION', message: 'summary is required.' });
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
        send(res, 400, { code: 'VALIDATION', message: 'reportDate must be YYYY-MM-DD.' });
        return;
      }
      if (programId && !findProgram(programId)) {
        send(res, 400, { code: 'VALIDATION', message: `No program with id "${programId}".` });
        return;
      }
      if (mood !== null && !VALID_MOODS.has(mood)) {
        send(res, 400, {
          code: 'VALIDATION',
          message: "mood must be one of 'happy', 'okay', 'sad', 'mad' or null.",
        });
        return;
      }

      const pc = findParentChild(parentChildId);
      const now = new Date().toISOString();
      const reportKind = institutionKindOf(institutionId);
      const isSession = reportKind === 'session';
      const record = {
        id: `dr_${randomUUID().slice(0, 8)}`,
        parentChildId,
        parentId: pc.parent.id,
        institutionId,
        programId,
        reportKind,
        reportDate,
        status: publish ? 'published' : 'draft',
        postedAt: now,
        publishedAt: publish ? now : null,
        authorEmail: account.email,
        authorName: account.displayName,
        mood: normaliseMood(mood ?? null),
        meals: isSession ? null : normaliseMeals(body?.meals),
        drinks: isSession ? null : normaliseDrinks(body?.drinks),
        sleep: isSession ? null : normaliseSleep(body?.sleep),
        hygiene: isSession ? null : normaliseHygiene(body?.hygiene),
        session: isSession ? normaliseSession(body?.session) : null,
        summary,
        highlights,
        concerns,
        media: normaliseMedia(body?.media),
      };
      dailyReports.push(record);
      send(res, 200, dailyReportToDto(record));
      return;
    }

    if (req.method === 'PATCH' && /^\/api\/daily-reports\/[^/]+$/.test(path)) {
      const auth = authenticate(req);
      if (auth.error) {
        send(res, auth.error.status, auth.error.body);
        return;
      }
      const account = auth.account;
      if (account.role !== 'staff') {
        send(res, 403, { code: 'FORBIDDEN', message: 'Only staff can edit daily reports.' });
        return;
      }
      const id = decodeURIComponent(path.split('/')[3]);
      const r = dailyReports.find((x) => x.id === id);
      if (!r) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      if (r.authorEmail !== account.email) {
        send(res, 403, {
          code: 'FORBIDDEN',
          message: 'Only the original author can edit this report.',
        });
        return;
      }
      const body = await readBody(req);
      if (body.reportDate != null) {
        const d = String(body.reportDate);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          send(res, 400, { code: 'VALIDATION', message: 'reportDate must be YYYY-MM-DD.' });
          return;
        }
        r.reportDate = d;
      }
      if (body.programId !== undefined) {
        const pid = body.programId ? String(body.programId).trim() || null : null;
        if (pid && !findProgram(pid)) {
          send(res, 400, { code: 'VALIDATION', message: `No program with id "${pid}".` });
          return;
        }
        r.programId = pid;
      }
      if (body.mood !== undefined) {
        const m = body.mood;
        if (m !== null && !VALID_MOODS.has(m)) {
          send(res, 400, {
            code: 'VALIDATION',
            message: "mood must be one of 'happy', 'okay', 'sad', 'mad' or null.",
          });
          return;
        }
        r.mood = normaliseMood(m);
      }
      const isSessionReport =
        (r.reportKind || institutionKindOf(r.institutionId)) === 'session';
      if (!isSessionReport) {
        if (body.meals !== undefined) {
          r.meals = normaliseMeals(body.meals);
        }
        if (body.drinks !== undefined) {
          r.drinks = normaliseDrinks(body.drinks);
        }
        if (body.sleep !== undefined) {
          r.sleep = normaliseSleep(body.sleep);
        }
        if (body.hygiene !== undefined) {
          r.hygiene = normaliseHygiene(body.hygiene);
        }
      }
      if (isSessionReport && body.session !== undefined) {
        r.session = normaliseSession(body.session);
      }
      if (body.media !== undefined) {
        r.media = normaliseMedia(body.media);
      }
      if (body.summary !== undefined) {
        const s = String(body.summary || '').trim();
        if (!s) {
          send(res, 400, { code: 'VALIDATION', message: 'summary cannot be empty.' });
          return;
        }
        r.summary = s;
      }
      if (body.highlights !== undefined) {
        r.highlights = body.highlights ? String(body.highlights).trim() || null : null;
      }
      if (body.concerns !== undefined) {
        r.concerns = body.concerns ? String(body.concerns).trim() || null : null;
      }
      r.postedAt = new Date().toISOString();
      send(res, 200, dailyReportToDto(r));
      return;
    }

    if (
      req.method === 'POST' &&
      /^\/api\/daily-reports\/[^/]+\/publish$/.test(path)
    ) {
      const auth = authenticate(req);
      if (auth.error) {
        send(res, auth.error.status, auth.error.body);
        return;
      }
      const account = auth.account;
      if (account.role !== 'staff') {
        send(res, 403, { code: 'FORBIDDEN', message: 'Only staff can publish daily reports.' });
        return;
      }
      const id = decodeURIComponent(path.split('/')[3]);
      const r = dailyReports.find((x) => x.id === id);
      if (!r) {
        send(res, 404, { message: 'Not found' });
        return;
      }
      if (r.authorEmail !== account.email) {
        send(res, 403, {
          code: 'FORBIDDEN',
          message: 'Only the original author can publish this report.',
        });
        return;
      }
      if (!r.summary?.trim()) {
        send(res, 400, {
          code: 'VALIDATION',
          message: 'Cannot publish a report with an empty summary.',
        });
        return;
      }
      if (r.status === 'draft') {
        const now = new Date().toISOString();
        r.status = 'published';
        r.publishedAt = now;
        r.postedAt = now;
      }
      send(res, 200, dailyReportToDto(r));
      return;
    }

    /* ------------------------------------------------------------------ */
    /* Daily reports DTO helper                                            */
    /* ------------------------------------------------------------------ */
    // (function declared via `function` so it's hoisted before the GET handler runs.)

    if (req.method === 'GET' && path === '/api/staff/me/programs') {
      const auth = authenticate(req);
      if (auth.error) {
        send(res, auth.error.status, auth.error.body);
        return;
      }
      const account = auth.account;
      if (account.role !== 'staff') {
        send(res, 403, {
          code: 'FORBIDDEN',
          message: 'This endpoint is staff-only.',
        });
        return;
      }
      const inst = resolveInstitution(account.staffInstitutionId) || {
        id: account.staffInstitutionId,
        name: account.staffInstitutionId,
      };
      const ids = new Set(account.staffAssignedProgramIds || []);
      const programs = PROGRAMS.filter((p) => ids.has(p.id)).map((p) => ({
        ...p,
        institutionId: inst.id,
        institutionName: inst.name,
      }));
      send(res, 200, { programs });
      return;
    }

    send(res, 404, { message: 'No route', path });
  } catch (e) {
    send(res, 500, { message: String(e?.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Platform mock API listening on http://127.0.0.1:${PORT}`);
});
