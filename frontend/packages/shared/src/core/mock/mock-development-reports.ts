/**
 * Seed developmental milestone reports.
 *
 * Two children at Little Stars Preschool are seeded so the parent and
 * staff UIs each have meaningful longitudinal data:
 *
 *   • Azifani Mavuso (parentChildId matches ParentMockSeeder / live API;
 *     legacy mock alias `pchild_azifani` still resolves) — three reports across
 *     2025 (Term 2 → Term 3 → Term 4). Demonstrates within-year
 *     progression and uses the SA-DBE 2 – 3 years template.
 *
 *       - Term 2: roughly half the milestones achieved (baseline).
 *       - Term 3: about three-quarters achieved (steady gains).
 *       - Term 4: almost all achieved, mirroring the Woodlands worked
 *         example attached by the user verbatim.
 *
 *   • Kabelo Mavuso (same — canonical GUID + legacy `pchild_kabelo`) — three year-end reports
 *     across 2023 / 2024 / 2025. Demonstrates year-over-year progression
 *     for an Aftercare learner and uses the SA-DBE Foundation Phase
 *     template (5 – 8 years).
 *
 *       - Term 4 2023: ~50% achieved (Grade R baseline).
 *       - Term 4 2024: ~80% achieved (Grade 1 growth).
 *       - Term 4 2025: ~95% achieved (Grade 2 mastery).
 *
 * Items not present in `responses[sectionId].items` are treated as
 * `'not_yet'` by the renderer — no need to spell them all out.
 */

import type {
  Phase0DevelopmentReport,
  Phase0ItemResponse,
  Phase0SectionResponse,
} from '../contracts/development-reports.phase0';
import { findMilestoneTemplate } from './mock-development-templates';

/** Little Stars tenant — matches `Seed:Tenants` + live API / Atlas. */
export const LITTLE_STARS_TENANT_ID = '019dba00-0000-7000-9000-000000000001';

/** Legacy admin mock platform key (`MOCK_PLATFORM_TENANTS`). */
const MOCK_TENANT_LITTLE_STARS = 'tenant_little_stars';

/** Seeded parent-child ids — same as `ParentMockSeeder` for Mninawa's children. */
export const AZIFANI_PARENT_CHILD_ID = '019db8b3-513e-7c11-81ed-48dc94c8d212';
export const KABELO_PARENT_CHILD_ID = '62f862f2-afae-4ab2-acee-3f752c2f9ada';

const MOCK_PCHILD_AZIFANI = 'pchild_azifani';
const MOCK_PCHILD_KABELO = 'pchild_kabelo';

/**
 * Map legacy mock institution keys to the canonical tenant id so development
 * reports match both offline `tenant_little_stars` and live UUID tenants.
 */
export function normalizeDevelopmentInstitutionId(id: string): string {
  if (!id) return id;
  const t = id.trim();
  if (t === MOCK_TENANT_LITTLE_STARS) return LITTLE_STARS_TENANT_ID;
  return t;
}

/**
 * Map legacy `pchild_*` ids to the canonical parentChild GUIDs used in live
 * mode (parent portal + workspace child detail).
 */
export function normalizeDevelopmentParentChildId(id: string): string {
  if (!id) return id;
  const t = id.trim();
  if (t === MOCK_PCHILD_AZIFANI) return AZIFANI_PARENT_CHILD_ID;
  if (t === MOCK_PCHILD_KABELO) return KABELO_PARENT_CHILD_ID;
  return t;
}

const TEMPLATE_ID = 'tmpl_sa_dbe_2to3y';
const TEMPLATE_VERSION = 1;

const T4_2025: Phase0DevelopmentReport = buildAzifaniReport({
  id: 'devrep_azifani_t4_2025',
  termLabel: 'Term 4 2025',
  termSequence: 4,
  termYear: 2025,
  vitals: { height: '96', weight: '16.8' },
  workingOnItemIds: new Set([
    // Sensory — "with a little more support, we look forward to seeing her complete them independently"
    'sn.v.puzzle_12',
    // Social — "though she sometimes finds it challenging to share"
    'se.s.give_take',
    // Social — "Azifani is also working on her body image and enjoys practising how to draw her face"
    'se.l.draw_body',
    // Communication — "She is beginning to draw straight and circular lines with a little help"
    'co.w.lines',
    // Mathematics — "Azifani is beginning to explore concepts such as near and far"
    'ma.s.concepts',
    // World — "developing an understanding of the concept of time"
    'wo.s.day_night',
  ]),
  notYetItemIds: new Set<string>(),
  comments: {
    sensory:
      'Azifani is a cheerful and enthusiastic little girl who brings joy to our classroom. She participates in all activities with excitement and a positive attitude, showing great enthusiasm in everything she does. Her gross and fine motor skills have developed beautifully, and she can complete most tasks independently. Azifani enjoys working with puzzles, and with a little more support, we look forward to seeing her complete them independently. We will continue to encourage and guide her as she grows in confidence and independence.',
    social_emotional:
      'Azifani always greets her teachers with a big smile and warm hugs each morning, which truly brightens our day. She can say her name confidently and show her age using her fingers. Azifani understands the idea of give and take, though she sometimes finds it challenging to share. We continue to encourage her to share and to use gentle hands when playing with her friends. Azifani is also working on her body image and enjoys practising how to draw her face, including details such as eyes, nose, mouth, ears, and hair.',
    communication:
      'Azifani\u2019s language skills are developing beautifully as she continues to use and learn new words each day. Although some words are still unclear, she is making wonderful progress, and we are confident that she will continue to improve in this area. Azifani loves listening to stories and often pretends to read, turning the pages and looking at the pictures with great interest. She is beginning to draw straight and circular lines with a little help, which is helping to strengthen her pencil grip and control.',
    mathematics:
      'Azifani has made tremendous progress in this area. Her counting skills have improved greatly. She can confidently count up to 15 and is working towards reaching 20. Her understanding of shapes and colours has also developed very well. Azifani is beginning to explore concepts such as near and far, and we will continue to support her to ensure she understands these ideas fully. Well done, Azifani!',
    creative:
      'Azifani enjoys imaginative play in our classroom kitchen area, often taking the lead and pretending to be the head chef. Her creativity continues to blossom as she explores new ideas and expresses herself through play. It is wonderful to see her imagination and confidence grow each day.',
    world:
      'Azifani understands the concept of \u201con\u201d and \u201coff\u201d and enjoys noticing these changes when we use the classroom light switch. With continued guidance and her natural curiosity, she is developing an understanding of the concept of time and is eager to explore more about the world around her.',
  },
  closingComment:
    'Azifani has brought so much joy and warmth to our classroom this year. We are so proud of the remarkable progress she has made and the growing confidence she shows each day. As Azifani moves on to the next class, we are excited to see her continue to learn, grow, and shine. Well done, Azifani! Keep reaching for the stars!',
  status: 'published',
  createdAt: '2025-12-01T08:30:00Z',
  updatedAt: '2025-12-05T14:10:00Z',
  publishedAt: '2025-12-05T14:10:00Z',
});

const T3_2025: Phase0DevelopmentReport = buildAzifaniReport({
  id: 'devrep_azifani_t3_2025',
  termLabel: 'Term 3 2025',
  termSequence: 3,
  termYear: 2025,
  vitals: { height: '94', weight: '16.1' },
  workingOnItemIds: new Set([
    'wb.hh.blow_nose',
    'wb.ss.tantrums',
    'wb.ss.solutions',
    'gm.jump_one_leg',
    'gm.walk_toes',
    'gm.balance_heels_toes',
    'fm.beads',
    'sn.v.puzzle_12',
    'sn.a.recall_3',
    'se.s.give_take',
    'se.s.group',
    'se.l.buttons',
    'se.l.zip',
    'se.l.draw_body',
    'co.c.sequence',
    'co.r.name_pictures',
    'co.r.name_actions',
    'co.w.lines',
    'co.w.copy_lines',
    'ma.n.many_few',
    'ma.s.concepts',
    'ma.sh.copy_circle',
    'ma.sh.spatial_perform',
    'cr.i.copies_song',
    'wo.s.day_night',
  ]),
  notYetItemIds: new Set<string>(),
  comments: {
    sensory:
      'Azifani continues to enjoy sensory play and is more confident exploring textures and sounds. Puzzle work is improving — she can manage 8-piece puzzles and is starting to attempt 12-piece sets with support.',
    social_emotional:
      'Azifani plays happily alongside her friends and is starting to join in group activities more often. Sharing is still a work in progress and we are gently coaching her through it during play.',
    communication:
      'Sentence length is growing nicely; Azifani uses 3-4 word sentences regularly. She loves story time and asks for the same favourites again and again. Pencil grip is developing well.',
    mathematics:
      'Counting up to 10 is consistent. We are working on the difference between many and few, and on copying simple shapes from a model.',
    creative:
      'Imaginative play is one of Azifani\u2019s strengths. She makes up little stories with the play kitchen toys and enjoys dancing to music time.',
    world:
      'Azifani is curious about how things work and enjoys cause-and-effect toys. We are introducing the concept of day vs night through our morning circle routine.',
  },
  closingComment:
    'A solid term of growth across every area. Azifani is settling in well and is a much-loved member of our class. Looking forward to a strong final term.',
  status: 'published',
  createdAt: '2025-09-08T08:00:00Z',
  updatedAt: '2025-09-12T13:00:00Z',
  publishedAt: '2025-09-12T13:00:00Z',
});

const T2_2025: Phase0DevelopmentReport = buildAzifaniReport({
  id: 'devrep_azifani_t2_2025',
  termLabel: 'Term 2 2025',
  termSequence: 2,
  termYear: 2025,
  vitals: { height: '92', weight: '15.4' },
  workingOnItemIds: new Set([
    'wb.nu.manners',
    'wb.hh.toilet_day',
    'wb.hh.blow_nose',
    'wb.ss.tantrums',
    'wb.ss.evaluates_risk',
    'wb.ss.solutions',
    'gm.jump_one_leg',
    'gm.walk_toes',
    'gm.throw_overhand',
    'gm.balance_heels_toes',
    'gm.kick_target',
    'fm.tower',
    'fm.beads',
    'sn.v.puzzle_12',
    'sn.v.sort_property',
    'sn.a.recall_3',
    'sn.t.eyes_closed',
    'sn.t.blindfold',
    'se.s.turn_taking',
    'se.s.give_take',
    'se.s.group',
    'se.l.shoes_on',
    'se.l.jacket_on',
    'se.l.buttons',
    'se.l.zip',
    'se.l.body_parts',
    'co.c.three_word',
    'co.c.plurals',
    'co.c.adjectives',
    'co.c.sequence',
    'co.l.commands',
    'co.l.answer_story',
    'co.r.name_pictures',
    'co.r.name_actions',
    'co.r.text_pictures',
    'co.w.fingers',
    'co.w.lines',
    'co.w.dominance',
    'ma.n.count_5',
    'ma.n.many_few',
    'ma.s.match_colours',
    'ma.s.concepts',
    'ma.sh.match',
    'ma.sh.id_shapes',
    'ma.sh.copy_circle',
    'ma.sh.spatial_self',
    'ma.sh.spatial_perform',
    'cr.i.copies_song',
    'cr.i.imaginary_play',
    'wo.s.day_night',
  ]),
  notYetItemIds: new Set([
    'sn.v.landmarks',
    'sn.t.blindfold',
    'co.r.name_actions',
    'ma.sh.id_shapes',
  ]),
  comments: {
    sensory:
      'Azifani is still warming up to the classroom routine. Her favourite activity at the moment is the sand tray. We are introducing more puzzle work in small steps.',
    social_emotional:
      'Most days Azifani plays alongside her friends rather than with them — typical at this age. She is learning to ask for help and to use her words instead of pulling.',
    communication:
      'Two-to-three word sentences with familiar people. Azifani has a beautiful smile and uses gestures generously to fill gaps in vocabulary.',
    mathematics:
      'We are practising counting through songs and rhymes. Colour matching is reliable for primary colours.',
    creative:
      'Azifani loves the wendy house and enjoys dressing up. Her painting strokes are getting more deliberate.',
    world:
      'Curious about the natural world — especially the bugs in the garden. We are using our nature walks to introduce simple cause-and-effect language.',
  },
  closingComment:
    'A wonderful first half of the year. Azifani has settled in beautifully and is starting to find her voice in the class. Excited to see her continue to grow.',
  status: 'published',
  createdAt: '2025-06-09T08:00:00Z',
  updatedAt: '2025-06-13T15:00:00Z',
  publishedAt: '2025-06-13T15:00:00Z',
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Kabelo Mavuso — three year-end reports (2023 / 2024 / 2025)                */
/*                                                                            */
/* Kabelo is in the Aftercare programme at Little Stars (`pchild_kabelo`,     */
/* DOB 2017-10-19). The Foundation Phase template applies — the reports       */
/* below show steady year-over-year growth from his Grade R baseline          */
/* (~50%) through Grade 1 (~70%) to Grade 2 (~95%).                           */
/* ────────────────────────────────────────────────────────────────────────── */

const KABELO_TEMPLATE_ID = 'tmpl_sa_dbe_foundation';
const KABELO_TEMPLATE_VERSION = 1;

const KABELO_T4_2023: Phase0DevelopmentReport = buildKabeloReport({
  id: 'devrep_kabelo_t4_2023',
  termLabel: 'Term 4 2023',
  termSequence: 4,
  termYear: 2023,
  vitals: { height: '116', weight: '21.4' },
  workingOnItemIds: new Set([
    'wb.sc.tidy',
    'wb.r.calm',
    'wb.r.transitions',
    'ps.p.share',
    'ps.p.conflict',
    'ps.i.intro',
    'ps.i.opinions',
    'la.l.retell',
    'la.l.discuss',
    'la.r.sight',
    'la.r.comprehension',
    'la.w.case',
    'la.w.sentence',
    'la.w.story',
    'nu.c.recognise',
    'nu.c.before_after',
    'nu.o.add',
    'nu.o.subtract',
    'nu.o.word_problems',
    'nu.o.skip',
    'nu.m.length',
    'nu.m.time',
    'nu.m.money',
    'ls.w.community',
    'ls.b.road',
    'cr.m.represent',
    'cr.m.colour_mix',
    'cr.p.role_play',
  ]),
  notYetItemIds: new Set([
    'la.w.story',
    'nu.o.word_problems',
    'nu.o.skip',
    'nu.m.time',
    'nu.m.money',
  ]),
  comments: {
    wellbeing:
      'Kabelo settled into the Aftercare routine well in his first year with us. He is independent at lunch and toilet routines and only occasionally needs reminders to pack his bag at home time.',
    personal_social:
      'A friendly child who plays well alongside others. We are gently coaching him through sharing the favourite bikes — a typical Grade R challenge — and seeing steady improvement.',
    language:
      'Kabelo recognises his letter sounds and is starting to blend simple CVC words. Story retells are still short and sometimes out of order; we read together every afternoon to build this skill.',
    numeracy:
      'Numbers to 20 are confident. We are extending his counting to 100 in 2s and 5s and introducing simple addition with concrete materials.',
    life_skills:
      'Curious about the natural world — loves our recycling sorting station and seasonal nature table. Road safety is taught through role-play crossings on Friday outings.',
    creative:
      'Kabelo enjoys building with the construction toys most of all. He is starting to draw recognisable family pictures and is happiest when there is music in the room.',
  },
  closingComment:
    'A solid first year of Aftercare for Kabelo. He has built friendships, found his voice in the group, and is well prepared for the academic step-up to Grade 1 next year. Well done, Kabelo!',
  status: 'published',
  createdAt: '2023-12-04T08:00:00Z',
  updatedAt: '2023-12-08T15:00:00Z',
  publishedAt: '2023-12-08T15:00:00Z',
});

const KABELO_T4_2024: Phase0DevelopmentReport = buildKabeloReport({
  id: 'devrep_kabelo_t4_2024',
  termLabel: 'Term 4 2024',
  termSequence: 4,
  termYear: 2024,
  vitals: { height: '122', weight: '23.7' },
  workingOnItemIds: new Set([
    'wb.r.calm',
    'ps.p.conflict',
    'ps.i.opinions',
    'la.l.retell',
    'la.r.choose',
    'la.w.story',
    'nu.o.word_problems',
    'nu.o.skip',
    'nu.m.time',
    'nu.m.money',
    'ls.b.road',
    'cr.p.role_play',
  ]),
  notYetItemIds: new Set([
    'nu.m.money',
  ]),
  comments: {
    wellbeing:
      'Kabelo is now fully independent across all self-care routines. We have noticed beautiful growth in how he handles frustration — he now uses words first and asks for help calmly.',
    personal_social:
      'Kabelo has emerged as one of our quietly confident leaders this year. Younger children gravitate to him in the construction corner and he is patient and kind with them.',
    language:
      'A wonderful year of literacy growth. He is reading short stories on his own and writing simple sentences with capital letters and full stops most of the time. Story-writing is the next step.',
    numeracy:
      'Counting to 100 is rock-solid; Kabelo can also skip-count in 2s and 5s. Addition and subtraction within 20 are mastered. Word problems and reading the time are areas we are extending.',
    life_skills:
      'Loves our weekly science experiments — most enthusiastic about anything involving water or magnets. He confidently names the seasons and most community helpers.',
    creative:
      'Kabelo started learning the violin at Sonata Music this year and has brought that musicality back to our class — he loves leading the rhythm games at music time.',
  },
  closingComment:
    'A wonderful Grade 1 year for Kabelo. He has grown academically and socially in equal measure, and his self-confidence has visibly blossomed. We are very proud of him.',
  status: 'published',
  createdAt: '2024-12-02T08:00:00Z',
  updatedAt: '2024-12-06T15:00:00Z',
  publishedAt: '2024-12-06T15:00:00Z',
});

const KABELO_T4_2025: Phase0DevelopmentReport = buildKabeloReport({
  id: 'devrep_kabelo_t4_2025',
  termLabel: 'Term 4 2025',
  termSequence: 4,
  termYear: 2025,
  vitals: { height: '128', weight: '26.2' },
  workingOnItemIds: new Set([
    'la.w.story',
    'nu.m.money',
    'cr.p.role_play',
  ]),
  notYetItemIds: new Set<string>(),
  comments: {
    wellbeing:
      'Kabelo is a wonderful role model for the younger children in our Aftercare group. He is independent, calm under pressure, and is often the first to help a friend tie a shoelace or open a lunchbox.',
    personal_social:
      'Genuine empathy and a quiet leadership style — Kabelo notices when a friend is sad and goes to comfort them without being asked. He has navigated a couple of small group disagreements with grace this year.',
    language:
      'Reading is fluent and a clear pleasure for Kabelo — he often takes a chapter book to the quiet corner during free time. Writing is solid; longer creative stories are the next stretch.',
    numeracy:
      'Numeracy is a real strength. He happily tackles two-step word problems and is comfortable with skip-counting in 2s, 5s and 10s. Telling time on the hour, half-hour and quarter-hour is now reliable. Money handling is the only area we are still building.',
    life_skills:
      'Excellent general knowledge for his age. Kabelo asks thoughtful questions during our community-helper visits and is our reigning recycling champion.',
    creative:
      'Kabelo has continued to flourish musically and has started to bring more of his violin practice into our music sessions. Drawing has become a favourite quiet-time activity.',
  },
  closingComment:
    'It has been a privilege to watch Kabelo grow over the last three years in our Aftercare. He leaves us a confident, kind and curious learner ready for whatever Grade 3 and beyond will bring. Stay shining, Kabelo!',
  status: 'published',
  createdAt: '2025-12-01T08:00:00Z',
  updatedAt: '2025-12-05T15:00:00Z',
  publishedAt: '2025-12-05T15:00:00Z',
});

/* ────────────────────────────────────────────────────────────────────────── */
/* Store + helpers                                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export const MOCK_DEVELOPMENT_REPORTS: Phase0DevelopmentReport[] = [
  T2_2025,
  T3_2025,
  T4_2025,
  KABELO_T4_2023,
  KABELO_T4_2024,
  KABELO_T4_2025,
];

interface AzifaniSeedInput {
  id: string;
  termLabel: string;
  termSequence: number;
  termYear: number;
  vitals: Record<string, string>;
  /** Item ids to mark as 'working_on'. */
  workingOnItemIds: Set<string>;
  /** Item ids to mark as 'not_yet' (everything else NOT in working/not_yet -> achieved). */
  notYetItemIds: Set<string>;
  /** Comments per section id. */
  comments: Partial<Record<string, string>>;
  closingComment: string;
  status: Phase0DevelopmentReport['status'];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

function buildAzifaniReport(input: AzifaniSeedInput): Phase0DevelopmentReport {
  const template = findMilestoneTemplate(TEMPLATE_ID, TEMPLATE_VERSION);
  if (!template) {
    throw new Error(
      `Cannot seed development reports: template ${TEMPLATE_ID} v${TEMPLATE_VERSION} not found.`,
    );
  }
  const responses: Record<string, Phase0SectionResponse> = {};
  for (const section of template.sections) {
    const items: Record<string, Phase0ItemResponse> = {};
    for (const group of section.groups) {
      for (const item of group.items) {
        let state: Phase0ItemResponse['state'] = 'achieved';
        if (input.workingOnItemIds.has(item.id)) state = 'working_on';
        else if (input.notYetItemIds.has(item.id)) state = 'not_yet';
        items[item.id] = { state, note: null };
      }
    }
    responses[section.id] = {
      items,
      comment: input.comments[section.id] ?? '',
    };
  }
  return {
    id: input.id,
    parentChildId: AZIFANI_PARENT_CHILD_ID,
    institutionId: LITTLE_STARS_TENANT_ID,
    institutionName: 'Little Stars Preschool',
    programLabel: 'Preschool',
    templateId: template.id,
    templateVersion: template.version,
    termLabel: input.termLabel,
    termSequence: input.termSequence,
    termYear: input.termYear,
    childSnapshot: {
      displayName: 'Azifani Mavuso',
      dateOfBirth: '2021-03-12',
    },
    vitals: input.vitals,
    teacherName: 'Linda Ndlovu',
    principalName: 'Naledi Khumalo',
    responses,
    closingComment: input.closingComment,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    publishedAt: input.publishedAt,
    publishedById: input.publishedAt
      ? 'staff_linda@littlestars.test'
      : null,
  };
}

function buildKabeloReport(input: AzifaniSeedInput): Phase0DevelopmentReport {
  const template = findMilestoneTemplate(KABELO_TEMPLATE_ID, KABELO_TEMPLATE_VERSION);
  if (!template) {
    throw new Error(
      `Cannot seed development reports: template ${KABELO_TEMPLATE_ID} v${KABELO_TEMPLATE_VERSION} not found.`,
    );
  }
  const responses: Record<string, Phase0SectionResponse> = {};
  for (const section of template.sections) {
    const items: Record<string, Phase0ItemResponse> = {};
    for (const group of section.groups) {
      for (const item of group.items) {
        let state: Phase0ItemResponse['state'] = 'achieved';
        if (input.workingOnItemIds.has(item.id)) state = 'working_on';
        else if (input.notYetItemIds.has(item.id)) state = 'not_yet';
        items[item.id] = { state, note: null };
      }
    }
    responses[section.id] = {
      items,
      comment: input.comments[section.id] ?? '',
    };
  }
  return {
    id: input.id,
    parentChildId: KABELO_PARENT_CHILD_ID,
    institutionId: LITTLE_STARS_TENANT_ID,
    institutionName: 'Little Stars Preschool',
    programLabel: 'Aftercare (5 – 9 yrs)',
    templateId: template.id,
    templateVersion: template.version,
    termLabel: input.termLabel,
    termSequence: input.termSequence,
    termYear: input.termYear,
    childSnapshot: {
      displayName: 'Kabelo Mavuso',
      dateOfBirth: '2017-10-19',
    },
    vitals: input.vitals,
    teacherName: 'Jane Naidoo',
    principalName: 'Naledi Khumalo',
    responses,
    closingComment: input.closingComment,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    publishedAt: input.publishedAt,
    publishedById: input.publishedAt
      ? 'staff_jane@littlestars.test'
      : null,
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Reads                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

export function listDevelopmentReports(filter: {
  parentChildId?: string;
  institutionId?: string;
  status?: Phase0DevelopmentReport['status'];
}): Phase0DevelopmentReport[] {
  const wantChild = filter.parentChildId
    ? normalizeDevelopmentParentChildId(filter.parentChildId)
    : null;
  const wantInst = filter.institutionId
    ? normalizeDevelopmentInstitutionId(filter.institutionId)
    : null;

  return MOCK_DEVELOPMENT_REPORTS.filter((r) => {
    if (wantChild != null && normalizeDevelopmentParentChildId(r.parentChildId) !== wantChild)
      return false;
    if (wantInst != null && normalizeDevelopmentInstitutionId(r.institutionId) !== wantInst)
      return false;
    if (filter.status && r.status !== filter.status) return false;
    return true;
  }).sort(byTermDesc);
}

export function findDevelopmentReportById(id: string): Phase0DevelopmentReport | undefined {
  return MOCK_DEVELOPMENT_REPORTS.find((r) => r.id === id);
}

function byTermDesc(
  a: Phase0DevelopmentReport,
  b: Phase0DevelopmentReport,
): number {
  if (a.termYear !== b.termYear) return b.termYear - a.termYear;
  return b.termSequence - a.termSequence;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Mutators                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

export interface DevelopmentReportDraft {
  parentChildId: string;
  institutionId: string;
  institutionName: string;
  programLabel: string | null;
  templateId: string;
  templateVersion: number;
  termLabel: string;
  termSequence: number;
  termYear: number;
  childSnapshot: { displayName: string; dateOfBirth: string };
  vitals: Record<string, string>;
  teacherName: string;
  principalName: string | null;
  responses: Record<string, Phase0SectionResponse>;
  closingComment: string;
}

export function createDevelopmentReport(
  draft: DevelopmentReportDraft,
): Phase0DevelopmentReport {
  const now = new Date().toISOString();
  const report: Phase0DevelopmentReport = {
    id: `devrep_${randomId()}`,
    parentChildId: normalizeDevelopmentParentChildId(draft.parentChildId),
    institutionId: normalizeDevelopmentInstitutionId(draft.institutionId),
    institutionName: draft.institutionName,
    programLabel: draft.programLabel,
    templateId: draft.templateId,
    templateVersion: draft.templateVersion,
    termLabel: draft.termLabel,
    termSequence: draft.termSequence,
    termYear: draft.termYear,
    childSnapshot: { ...draft.childSnapshot },
    vitals: { ...draft.vitals },
    teacherName: draft.teacherName,
    principalName: draft.principalName,
    responses: cloneResponses(draft.responses),
    closingComment: draft.closingComment,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    publishedById: null,
  };
  MOCK_DEVELOPMENT_REPORTS.push(report);
  return report;
}

export function updateDevelopmentReport(
  id: string,
  patch: Partial<DevelopmentReportDraft>,
): Phase0DevelopmentReport | null {
  const idx = MOCK_DEVELOPMENT_REPORTS.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const cur = MOCK_DEVELOPMENT_REPORTS[idx];
  const next: Phase0DevelopmentReport = {
    ...cur,
    programLabel: patch.programLabel ?? cur.programLabel,
    termLabel: patch.termLabel ?? cur.termLabel,
    termSequence: patch.termSequence ?? cur.termSequence,
    termYear: patch.termYear ?? cur.termYear,
    vitals: patch.vitals ? { ...patch.vitals } : cur.vitals,
    teacherName: patch.teacherName ?? cur.teacherName,
    principalName:
      patch.principalName === undefined ? cur.principalName : patch.principalName,
    responses: patch.responses ? cloneResponses(patch.responses) : cur.responses,
    closingComment: patch.closingComment ?? cur.closingComment,
    childSnapshot: patch.childSnapshot
      ? { ...patch.childSnapshot }
      : cur.childSnapshot,
    updatedAt: new Date().toISOString(),
  };
  MOCK_DEVELOPMENT_REPORTS[idx] = next;
  return next;
}

export function publishDevelopmentReport(
  id: string,
  publishedById: string,
): Phase0DevelopmentReport | null {
  const r = MOCK_DEVELOPMENT_REPORTS.find((row) => row.id === id);
  if (!r) return null;
  const now = new Date().toISOString();
  r.status = 'published';
  r.publishedAt = now;
  r.publishedById = publishedById;
  r.updatedAt = now;
  return r;
}

export function unpublishDevelopmentReport(
  id: string,
): Phase0DevelopmentReport | null {
  const r = MOCK_DEVELOPMENT_REPORTS.find((row) => row.id === id);
  if (!r) return null;
  r.status = 'draft';
  r.publishedAt = null;
  r.publishedById = null;
  r.updatedAt = new Date().toISOString();
  return r;
}

export function deleteDevelopmentReport(id: string): boolean {
  const idx = MOCK_DEVELOPMENT_REPORTS.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  MOCK_DEVELOPMENT_REPORTS.splice(idx, 1);
  return true;
}

function cloneResponses(
  responses: Record<string, Phase0SectionResponse>,
): Record<string, Phase0SectionResponse> {
  const out: Record<string, Phase0SectionResponse> = {};
  for (const [k, v] of Object.entries(responses)) {
    out[k] = {
      comment: v.comment,
      items: Object.fromEntries(
        Object.entries(v.items).map(([itemId, resp]) => [
          itemId,
          { state: resp.state, note: resp.note ?? null },
        ]),
      ),
    };
  }
  return out;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
