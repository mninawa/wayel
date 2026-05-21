/**
 * Workspace programs helper.
 *
 * A "program" is the unit families subscribe to inside an institution. The
 * fee structure is **versioned by year** so that fees can be revised
 * annually without rewriting historical subscriptions:
 *
 *   - Each program owns a list of `WorkspaceProgramFee` rows keyed by
 *     calendar year.
 *   - New subscriptions always read the **latest** fee row (highest year).
 *   - Existing subscriptions retain whatever year they enrolled in (we
 *     don't model that subscription in this helper — just the schedule).
 *
 * Daycare-style institutions (preschool / crèche / aftercare) can run
 * either **full-day** or **half-day** programs and the cost differs, so
 * `schedule` is required for daycare programs and null on session
 * programs (swim, music, sport, robotics …) where there is no half-day
 * variant.
 */
import { institutionKindOf } from '../core/mock/mock-institutions';
import { MOCK_PARENTS } from '../core/mock/mock-parents';
import type { Phase0InstitutionKind } from '../core/contracts/daily-reports.phase0';

export type WorkspaceProgramKind = Phase0InstitutionKind; // 'daycare' | 'session'
export type WorkspaceProgramSchedule = 'full_day' | 'half_day';
export type WorkspaceFeeCadence = 'month' | 'term' | 'year';

export interface WorkspaceProgramFee {
  /** Calendar year this fee applies to (e.g. 2026). */
  year: number;
  /** Amount in major units (e.g. 5800 = R5 800). */
  amount: number;
  /** ISO-4217 currency code; demo data uses ZAR. */
  currency: string;
  cadence: WorkspaceFeeCadence;
  notes: string | null;
  /** ISO timestamp the row was last modified — handy for audit-style displays. */
  updatedAt: string;
}

/**
 * The two staff slots a program can be assigned to. A program may have at
 * most ONE Teacher and ONE Assistant — never two of the same role and the
 * same person cannot occupy both slots on a single program (they can hold
 * different roles on different programs though).
 */
export type WorkspaceProgramStaffRole = 'teacher' | 'assistant';

export interface WorkspaceProgram {
  id: string;
  institutionId: string;
  kind: WorkspaceProgramKind;
  /** Required for daycare; always null for session programs. */
  schedule: WorkspaceProgramSchedule | null;
  name: string;
  description: string | null;
  capacity: number | null;
  ageMin: number | null;
  ageMax: number | null;
  active: boolean;
  /**
   * Staff assignment — at most one Teacher and one Assistant. `null` means
   * the slot is vacant. The same staff id may not occupy both slots on the
   * same program (enforced in `assignProgramStaff`).
   */
  teacherStaffId: string | null;
  assistantStaffId: string | null;
  /** Fee rows; sorted descending by year on read. */
  fees: WorkspaceProgramFee[];
  createdAt: string;
  updatedAt: string;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Mock store                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

const NOW = new Date().toISOString();

/**
 * Seed a couple of tenants with rich program rosters so the section isn't
 * empty on first open. Other tenants start blank — operators can use the
 * "Add program" button to populate them.
 */
const PROGRAMS: WorkspaceProgram[] = [
  // ── tenant_little_stars (daycare) ──────────────────────────────────────
  seedDaycareProgram(
    'pgm_ls_toddlers_full',
    'tenant_little_stars',
    'full_day',
    {
      name: 'Toddlers — Full Day',
      description: 'Full-day toddler programme (07:00–17:30) with meals, naps and play themes.',
      capacity: 18,
      ageMin: 1,
      ageMax: 3,
      fees: [
        { year: 2024, amount: 5200 },
        { year: 2025, amount: 5500 },
        { year: 2026, amount: 5800 },
      ],
    },
    { teacher: 'staff_ls_lindiwe' },
  ),
  seedDaycareProgram(
    'pgm_ls_toddlers_half',
    'tenant_little_stars',
    'half_day',
    {
      name: 'Toddlers — Half Day',
      description: 'Half-day toddler programme (07:30–13:00). Includes morning snack and lunch.',
      capacity: 22,
      ageMin: 1,
      ageMax: 3,
      fees: [
        { year: 2024, amount: 3400 },
        { year: 2025, amount: 3600 },
        { year: 2026, amount: 3850 },
      ],
    },
  ),
  seedDaycareProgram(
    'pgm_ls_prek_full',
    'tenant_little_stars',
    'full_day',
    {
      name: 'Pre-K — Full Day',
      description: 'Grade R prep programme with literacy, numeracy and themed play.',
      capacity: 16,
      ageMin: 4,
      ageMax: 6,
      fees: [
        { year: 2024, amount: 5800 },
        { year: 2025, amount: 6200 },
        { year: 2026, amount: 6500 },
      ],
    },
  ),
  seedDaycareProgram(
    'pgm_ls_aftercare',
    'tenant_little_stars',
    'half_day',
    {
      name: 'Aftercare',
      description: 'Afternoon care for grade school children (12:30–17:30).',
      capacity: 24,
      ageMin: 5,
      ageMax: 9,
      fees: [
        { year: 2024, amount: 2400 },
        { year: 2025, amount: 2600 },
        { year: 2026, amount: 2800 },
      ],
    },
    { teacher: 'staff_ls_sipho', assistant: 'acct_jane_staff' },
  ),
  // Sunflowers (3-4 yrs) is the classroom every active toddler at Little
  // Stars is enrolled in (see `MOCK_PARENTS`). Surface it as its own
  // program so Jane Naidoo — the staff lead for that age group — has a
  // populated workspace when she signs into `/staff/institution/workspace`.
  seedDaycareProgram(
    'pgm_ls_sunflowers_full',
    'tenant_little_stars',
    'full_day',
    {
      name: 'Sunflowers — Full Day',
      description: 'Full-day Sunflowers room (3-4 yrs) — themed play, naps and meals.',
      capacity: 20,
      ageMin: 3,
      ageMax: 4,
      fees: [
        { year: 2024, amount: 5400 },
        { year: 2025, amount: 5700 },
        { year: 2026, amount: 6000 },
      ],
    },
    { teacher: 'acct_jane_staff', assistant: 'staff_ls_amahle' },
  ),

  // ── inst_aqua_stars (session — swim) ───────────────────────────────────
  seedSessionProgram(
    'pgm_aqua_beg',
    'inst_aqua_stars',
    {
      name: 'Beginner Swim',
      description: 'Water-confidence and basic stroke fundamentals. 30-min sessions.',
      capacity: 8,
      ageMin: 3,
      ageMax: 6,
      fees: [
        { year: 2024, amount: 850 },
        { year: 2025, amount: 920 },
        { year: 2026, amount: 980 },
      ],
    },
  ),
  seedSessionProgram(
    'pgm_aqua_inter',
    'inst_aqua_stars',
    {
      name: 'Intermediate Swim',
      description: 'Stroke refinement and 25-m endurance. 45-min sessions.',
      capacity: 10,
      ageMin: 6,
      ageMax: 10,
      fees: [
        { year: 2025, amount: 1080 },
        { year: 2026, amount: 1150 },
      ],
    },
  ),

  // ── inst_kintaro_karate (session — sport) ──────────────────────────────
  seedSessionProgram(
    'pgm_karate_white',
    'inst_kintaro_karate',
    {
      name: 'White Belt Foundations',
      description: 'Stances, basic strikes, dojo etiquette.',
      capacity: 14,
      ageMin: 5,
      ageMax: 8,
      fees: [
        { year: 2024, amount: 720 },
        { year: 2025, amount: 760 },
        { year: 2026, amount: 800 },
      ],
    },
  ),
];

interface SeedShape {
  name: string;
  description: string;
  capacity: number;
  ageMin: number;
  ageMax: number;
  fees: Array<{ year: number; amount: number }>;
}

interface StaffSeed {
  teacher?: string | null;
  assistant?: string | null;
}

function seedDaycareProgram(
  id: string,
  institutionId: string,
  schedule: WorkspaceProgramSchedule,
  shape: SeedShape,
  staff: StaffSeed = {},
): WorkspaceProgram {
  return {
    id,
    institutionId,
    kind: 'daycare',
    schedule,
    name: shape.name,
    description: shape.description,
    capacity: shape.capacity,
    ageMin: shape.ageMin,
    ageMax: shape.ageMax,
    active: true,
    teacherStaffId: staff.teacher ?? null,
    assistantStaffId: staff.assistant ?? null,
    fees: shape.fees.map((f) => ({
      year: f.year,
      amount: f.amount,
      currency: 'ZAR',
      cadence: 'month' as const,
      notes: null,
      updatedAt: NOW,
    })),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function seedSessionProgram(
  id: string,
  institutionId: string,
  shape: SeedShape,
  staff: StaffSeed = {},
): WorkspaceProgram {
  return {
    id,
    institutionId,
    kind: 'session',
    schedule: null,
    name: shape.name,
    description: shape.description,
    capacity: shape.capacity,
    ageMin: shape.ageMin,
    ageMax: shape.ageMax,
    active: true,
    teacherStaffId: staff.teacher ?? null,
    assistantStaffId: staff.assistant ?? null,
    fees: shape.fees.map((f) => ({
      year: f.year,
      amount: f.amount,
      currency: 'ZAR',
      cadence: 'month' as const,
      notes: null,
      updatedAt: NOW,
    })),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Reads                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export function listProgramsForInstitution(institutionId: string): WorkspaceProgram[] {
  return PROGRAMS.filter((p) => p.institutionId === institutionId)
    .map((p) => withSortedFees(p))
    .sort((a, b) => {
      // Group by schedule (full first), then alphabetical name.
      const sa = a.schedule ?? '';
      const sb = b.schedule ?? '';
      if (sa !== sb) return sa.localeCompare(sb);
      return a.name.localeCompare(b.name);
    });
}

export function findProgramById(id: string): WorkspaceProgram | undefined {
  const p = PROGRAMS.find((row) => row.id === id);
  return p ? withSortedFees(p) : undefined;
}

export function programKindForInstitution(institutionId: string): WorkspaceProgramKind {
  return institutionKindOf(institutionId);
}

/** Return the fee row with the highest year, or null when none configured. */
export function latestFeeFor(program: WorkspaceProgram): WorkspaceProgramFee | null {
  if (program.fees.length === 0) return null;
  return [...program.fees].sort((a, b) => b.year - a.year)[0];
}

function withSortedFees(p: WorkspaceProgram): WorkspaceProgram {
  return { ...p, fees: [...p.fees].sort((a, b) => b.year - a.year) };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Drafts / mutators                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface ProgramDraft {
  name: string;
  description: string | null;
  schedule: WorkspaceProgramSchedule | null;
  capacity: number | null;
  ageMin: number | null;
  ageMax: number | null;
  active: boolean;
}

export function createProgram(
  institutionId: string,
  draft: ProgramDraft,
): WorkspaceProgram {
  const kind = institutionKindOf(institutionId);
  const now = new Date().toISOString();
  const program: WorkspaceProgram = {
    id: `pgm_${Math.random().toString(36).slice(2, 10)}`,
    institutionId,
    kind,
    schedule: kind === 'daycare' ? draft.schedule ?? 'full_day' : null,
    name: draft.name.trim(),
    description: draft.description?.trim() || null,
    capacity: positiveOrNull(draft.capacity),
    ageMin: positiveOrNull(draft.ageMin),
    ageMax: positiveOrNull(draft.ageMax),
    active: draft.active !== false,
    teacherStaffId: null,
    assistantStaffId: null,
    fees: [],
    createdAt: now,
    updatedAt: now,
  };
  PROGRAMS.push(program);
  return withSortedFees(program);
}

export function updateProgram(
  id: string,
  draft: ProgramDraft,
): WorkspaceProgram | null {
  const idx = PROGRAMS.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const cur = PROGRAMS[idx];
  const next: WorkspaceProgram = {
    ...cur,
    name: draft.name.trim(),
    description: draft.description?.trim() || null,
    schedule: cur.kind === 'daycare' ? draft.schedule ?? cur.schedule : null,
    capacity: positiveOrNull(draft.capacity),
    ageMin: positiveOrNull(draft.ageMin),
    ageMax: positiveOrNull(draft.ageMax),
    active: draft.active,
    updatedAt: new Date().toISOString(),
  };
  PROGRAMS[idx] = next;
  return withSortedFees(next);
}

export function removeProgram(id: string): boolean {
  const idx = PROGRAMS.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  PROGRAMS.splice(idx, 1);
  return true;
}

export interface FeeDraft {
  year: number;
  amount: number;
  currency: string;
  cadence: WorkspaceFeeCadence;
  notes: string | null;
}

/**
 * Upsert a fee row for `year`. If a row with that year already exists it
 * is replaced (this is intentional — fees are versioned by year, so two
 * rows with the same year would be ambiguous).
 */
export function upsertProgramFee(
  programId: string,
  draft: FeeDraft,
): WorkspaceProgram | null {
  const program = PROGRAMS.find((p) => p.id === programId);
  if (!program) return null;
  const fee: WorkspaceProgramFee = {
    year: Math.floor(draft.year),
    amount: Math.max(0, Math.floor(draft.amount)),
    currency: draft.currency || 'ZAR',
    cadence: draft.cadence,
    notes: draft.notes?.trim() || null,
    updatedAt: new Date().toISOString(),
  };
  const idx = program.fees.findIndex((f) => f.year === fee.year);
  if (idx === -1) program.fees.push(fee);
  else program.fees[idx] = fee;
  program.updatedAt = fee.updatedAt;
  return withSortedFees(program);
}

export function removeProgramFee(programId: string, year: number): WorkspaceProgram | null {
  const program = PROGRAMS.find((p) => p.id === programId);
  if (!program) return null;
  const idx = program.fees.findIndex((f) => f.year === year);
  if (idx === -1) return withSortedFees(program);
  program.fees.splice(idx, 1);
  program.updatedAt = new Date().toISOString();
  return withSortedFees(program);
}

function positiveOrNull(n: number | null | undefined): number | null {
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  return n > 0 ? Math.floor(n) : null;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Display helpers                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export function scheduleLabel(s: WorkspaceProgramSchedule | null | undefined): string {
  switch (s) {
    case 'full_day':
      return 'Full day';
    case 'half_day':
      return 'Half day';
    default:
      return '—';
  }
}

export function cadenceLabel(c: WorkspaceFeeCadence): string {
  switch (c) {
    case 'month':
      return 'per month';
    case 'term':
      return 'per term';
    case 'year':
      return 'per year';
  }
}

/**
 * Phrase for subscription billing cadence returned by the API (`monthly`,
 * `yearly`, …) or legacy PascalCase (`Monthly`, …) from older mocks.
 */
export function subscriptionBillingCadencePhrase(
  value: string | null | undefined,
): string | null {
  if (value == null || value === '') return null;
  const key = value.trim().toLowerCase().replace(/_/g, '');
  const lowerMap: Record<string, string> = {
    none: 'one-off (no auto-renew)',
    monthly: 'monthly',
    termly: 'per term',
    sixmonths: 'every 6 months',
    ninemonths: 'every 9 months',
    yearly: 'yearly',
    unknown: '—',
  };
  if (lowerMap[key]) return lowerMap[key];
  const legacy: Record<string, string> = {
    Monthly: 'monthly',
    Termly: 'per term',
    SixMonths: 'every 6 months',
    NineMonths: 'every 9 months',
    Yearly: 'yearly',
    None: 'one-off (no auto-renew)',
  };
  return legacy[value.trim()] ?? null;
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

/** All the years currently configured across `programs`, descending. */
export function feeYearsAcross(programs: WorkspaceProgram[]): number[] {
  const set = new Set<number>();
  for (const p of programs) {
    for (const f of p.fees) set.add(f.year);
  }
  return [...set].sort((a, b) => b - a);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Staff assignment (max two per program: Teacher + Assistant)                */
/* ────────────────────────────────────────────────────────────────────────── */

export class ProgramStaffAssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgramStaffAssignmentError';
  }
}

/**
 * Assign or clear a staff member on the Teacher or Assistant slot of a
 * program. Pass `staffId = null` to clear the slot.
 *
 * Rules enforced here:
 *   - The same staff id cannot occupy BOTH slots on a single program.
 *   - Each program holds at most one Teacher and one Assistant (already
 *     guaranteed by the data shape — single string-or-null per slot).
 *
 * Returns the updated program, or `null` if the program id is unknown.
 * Throws `ProgramStaffAssignmentError` if the assignment would violate
 * the same-person-both-roles rule.
 */
export function assignProgramStaff(
  programId: string,
  role: WorkspaceProgramStaffRole,
  staffId: string | null,
): WorkspaceProgram | null {
  const program = PROGRAMS.find((p) => p.id === programId);
  if (!program) return null;

  if (staffId) {
    const otherRole: WorkspaceProgramStaffRole = role === 'teacher' ? 'assistant' : 'teacher';
    const otherCurrent =
      otherRole === 'teacher' ? program.teacherStaffId : program.assistantStaffId;
    if (otherCurrent === staffId) {
      throw new ProgramStaffAssignmentError(
        `This staff member is already the ${otherRole} on this program. ` +
          `One person cannot hold both roles on the same program.`,
      );
    }
  }

  if (role === 'teacher') {
    program.teacherStaffId = staffId;
  } else {
    program.assistantStaffId = staffId;
  }
  program.updatedAt = new Date().toISOString();
  return withSortedFees(program);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Student counts per year                                                    */
/*                                                                            */
/* The parent subscription model doesn't (yet) reference programs by id, so   */
/* we approximate per-year enrolment from two sources:                        */
/*   1. Real subscriptions in MOCK_PARENTS that match by                      */
/*      institutionId + classroom token overlap with the program name.        */
/*   2. A deterministic synthetic top-up so the workspace UI shows a          */
/*      believable count even for programs with no real subscriptions yet.    */
/*                                                                            */
/* Numbers are capped at the program's `capacity` when one is set.            */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Count students enrolled in `program` during a specific `year`.
 *
 * "Enrolled during the year" means the subscription was active for at
 * least part of that calendar year — i.e. it was enrolled on or before
 * 31 Dec of the year AND did not end before 1 Jan of the year.
 */
export function studentsForProgramYear(
  program: WorkspaceProgram,
  year: number,
): number {
  const real = countRealSubscriptions(program, year);
  // Synthetic only fills in when no real subscriptions are matched, so the
  // demo workspace never shows "0 students" while still giving real data
  // precedence whenever it exists.
  const total = real > 0 ? real : syntheticCount(program, year);
  if (program.capacity != null && program.capacity > 0) {
    return Math.min(total, program.capacity);
  }
  return total;
}

function countRealSubscriptions(program: WorkspaceProgram, year: number): number {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const tokens = nameTokens(program.name);

  let count = 0;
  for (const parent of MOCK_PARENTS) {
    for (const child of parent.children) {
      for (const sub of child.subscriptions) {
        if (sub.institutionId !== program.institutionId) continue;
        if (!sub.enrolledAt) continue;
        if (sub.enrolledAt > yearEnd) continue;
        if (sub.endedAt && sub.endedAt < yearStart) continue;
        if (program.kind === 'daycare' && program.schedule != null) {
          // Heuristic: match classroom against any name token (case-insensitive).
          const room = (sub.classroom ?? '').toLowerCase();
          const matches = tokens.some((t) => room.includes(t));
          if (!matches) continue;
        } else {
          // Session programs: match classroom token overlap.
          const room = (sub.classroom ?? '').toLowerCase();
          if (room && tokens.length && !tokens.some((t) => room.includes(t))) continue;
        }
        count += 1;
      }
    }
  }
  return count;
}

function syntheticCount(program: WorkspaceProgram, year: number): number {
  // Stable, capacity-aware top-up so the demo always shows numbers.
  const cap = program.capacity ?? 16;
  const seed = hashString(`${program.id}|${year}`);
  // Base ~ 55% of capacity, swing ±25%.
  const base = Math.floor(cap * 0.55);
  const swing = Math.floor(cap * 0.25);
  const variance = (seed % (swing * 2 + 1)) - swing;
  // Active programs trend higher; archived ones trend lower.
  const activityBias = program.active ? 1 : -3;
  return Math.max(0, base + variance + activityBias);
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4); // skip "the", "and", schedule words, etc.
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
