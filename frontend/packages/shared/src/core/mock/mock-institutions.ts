/**
 * Tiny in-memory directory of institutions used across the mock layer.
 *
 *   - The mock daily-reports generator reads `kind` to decide which report
 *     shape (`'daycare'` vs `'session'`) to synthesise.
 *   - The bridge services read `name` / `kind` when projecting to DTOs so
 *     the parent surface can render attendance / focus chips for sessions
 *     and meals / sleep blocks for daycare.
 *   - The parent-app subscribe page reads the *full* record (category,
 *     area, monthly fee, age range, blurb…) to render a searchable
 *     catalogue of places a parent can subscribe their child to.
 *
 * Once a real institutions table exists this module goes away and the
 * lookup happens server-side from that table.
 */

import type { Phase0InstitutionKind } from '../contracts/daily-reports.phase0';

/**
 * High-level grouping shown as filter chips on the parent subscribe page.
 *
 *   - `daycare` / `preschool` / `aftercare` are the long-form `daycare`-kind
 *     institutions that emit full daily reports (meals, sleep, hygiene…).
 *   - All others are short-format `session`-kind activities.
 */
export type MockInstitutionCategory =
  | 'daycare'
  | 'preschool'
  | 'aftercare'
  | 'swim'
  | 'music'
  | 'art'
  | 'martial_arts'
  | 'dance'
  | 'sports'
  | 'robotics'
  | 'language';

export interface MockInstitution {
  id: string;
  name: string;
  kind: Phase0InstitutionKind;
  category: MockInstitutionCategory;
  /** Suburb / neighbourhood — shown on the card. */
  area: string;
  /** City — used to group / filter. */
  city: string;
  /** One-line hook shown under the title. */
  tagline: string;
  /** Longer paragraph shown in the subscribe drawer. */
  description: string;
  /** ZAR per month, or null for "varies by program". */
  monthlyFeeZar: number | null;
  /** Inclusive min/max age in years — used for age-fit hint. */
  ageRangeYears: { min: number; max: number };
  /** Decorative accent color used as the card's logo background. */
  accentColor: string;
  /** Optional cover image (picsum seeded for stability). */
  imageUrl: string | null;
  /** Optional website (only used in the drawer). */
  website?: string;
}

/**
 * Human label for each category — used by chips and the subscribe form.
 *
 * Kept here so both the catalogue page and any future analytics surface
 * agree on the wording.
 */
export const MOCK_INSTITUTION_CATEGORY_LABELS: Record<
  MockInstitutionCategory,
  string
> = {
  daycare: 'Daycare',
  preschool: 'Preschool',
  aftercare: 'Aftercare',
  swim: 'Swimming',
  music: 'Music',
  art: 'Art',
  martial_arts: 'Martial arts',
  dance: 'Dance',
  sports: 'Sports',
  robotics: 'Robotics & coding',
  language: 'Languages',
};

export const MOCK_INSTITUTIONS: ReadonlyArray<MockInstitution> = [
  // ── Daycare / preschool / aftercare ─────────────────────────────────────
  {
    id: 'tenant_little_stars',
    name: 'Little Stars Preschool',
    kind: 'daycare',
    category: 'preschool',
    area: 'Bryanston',
    city: 'Johannesburg',
    tagline: 'Play-based preschool with a strong literacy programme.',
    description:
      'A small, nurturing preschool with two streams (toddlers and Grade R prep). Daily reports cover meals, sleep, hygiene and the day’s play themes.',
    monthlyFeeZar: 5800,
    ageRangeYears: { min: 1, max: 6 },
    accentColor: '#fde68a',
    imageUrl: 'https://picsum.photos/seed/inst-littlestars/600/360',
    website: 'https://littlestars.example.com',
  },
  {
    id: 'inst_sunny_grove_creche',
    name: 'Sunny Grove Crèche',
    kind: 'daycare',
    category: 'daycare',
    area: 'Sandton',
    city: 'Johannesburg',
    tagline: 'Full-day crèche from 6 months. Meals included.',
    description:
      'Long-day care for working parents. Two-teacher rooms, fenced garden and a chef-prepared menu. Daily reports include nappy changes, naps and feeds.',
    monthlyFeeZar: 6900,
    ageRangeYears: { min: 0, max: 4 },
    accentColor: '#fed7aa',
    imageUrl: 'https://picsum.photos/seed/inst-sunnygrove/600/360',
  },
  {
    id: 'inst_acorn_montessori',
    name: 'Acorn Montessori',
    kind: 'daycare',
    category: 'preschool',
    area: 'Parkhurst',
    city: 'Johannesburg',
    tagline: 'AMI-aligned Montessori 3-6 environment.',
    description:
      'Mixed-age 3-6 environment with classical Montessori materials. Reports focus on independent work cycles, practical life and language milestones.',
    monthlyFeeZar: 7400,
    ageRangeYears: { min: 3, max: 6 },
    accentColor: '#bbf7d0',
    imageUrl: 'https://picsum.photos/seed/inst-acorn/600/360',
  },
  {
    id: 'inst_riverbend_aftercare',
    name: 'Riverbend Aftercare',
    kind: 'daycare',
    category: 'aftercare',
    area: 'Linden',
    city: 'Johannesburg',
    tagline: 'Homework help + outdoor play, 13:00 – 17:30.',
    description:
      'Walking-distance aftercare for nearby primary schools. Homework support, healthy snack and 90 minutes of outdoor play built into every day.',
    monthlyFeeZar: 3200,
    ageRangeYears: { min: 5, max: 12 },
    accentColor: '#bae6fd',
    imageUrl: 'https://picsum.photos/seed/inst-riverbend/600/360',
  },
  {
    id: 'inst_jacaranda_preschool',
    name: 'Jacaranda Preschool',
    kind: 'daycare',
    category: 'preschool',
    area: 'Centurion',
    city: 'Pretoria',
    tagline: 'Bilingual EN/AF preschool with weekly nature outings.',
    description:
      'Bilingual preschool that runs weekly nature outings to the local park. Strong emphasis on outdoor sensory play and group storytelling.',
    monthlyFeeZar: 5400,
    ageRangeYears: { min: 2, max: 6 },
    accentColor: '#ddd6fe',
    imageUrl: 'https://picsum.photos/seed/inst-jacaranda/600/360',
  },
  {
    id: 'inst_seaside_creche',
    name: 'Seaside Crèche',
    kind: 'daycare',
    category: 'daycare',
    area: 'Sea Point',
    city: 'Cape Town',
    tagline: 'Beach-front crèche with a sea-themed curriculum.',
    description:
      'Tucked behind the promenade, Seaside runs a sea-themed curriculum with weekly trips to the tide pools. Daily reports cover meals, naps and the day’s outing.',
    monthlyFeeZar: 6200,
    ageRangeYears: { min: 1, max: 5 },
    accentColor: '#a5f3fc',
    imageUrl: 'https://picsum.photos/seed/inst-seaside/600/360',
  },

  // ── Swimming ────────────────────────────────────────────────────────────
  {
    id: 'inst_aqua_stars',
    name: 'Aqua Stars Swim Academy',
    kind: 'session',
    category: 'swim',
    area: 'Fourways',
    city: 'Johannesburg',
    tagline: 'Learn-to-swim through to stroke correction.',
    description:
      'Heated indoor pool, max 4 swimmers per coach. Levels run from water familiarisation (12 months) up to competitive stroke correction.',
    monthlyFeeZar: 1200,
    ageRangeYears: { min: 1, max: 14 },
    accentColor: '#bae6fd',
    imageUrl: 'https://picsum.photos/seed/inst-aquastars/600/360',
  },
  {
    id: 'inst_blue_marlin_swim',
    name: 'Blue Marlin Swim Club',
    kind: 'session',
    category: 'swim',
    area: 'Umhlanga',
    city: 'Durban',
    tagline: 'Coastal swim club, beginner to squad.',
    description:
      'Olympic-length outdoor pool. Beginner classes feed into a competitive squad — ideal for kids who want to race.',
    monthlyFeeZar: 1450,
    ageRangeYears: { min: 4, max: 16 },
    accentColor: '#7dd3fc',
    imageUrl: 'https://picsum.photos/seed/inst-bluemarlin/600/360',
  },

  // ── Music ───────────────────────────────────────────────────────────────
  {
    id: 'inst_sonata_music',
    name: 'Sonata Music School',
    kind: 'session',
    category: 'music',
    area: 'Rosebank',
    city: 'Johannesburg',
    tagline: 'Piano, violin, guitar, voice — 1-on-1 tuition.',
    description:
      'Individual 30-minute lessons across piano, violin, guitar and voice. Termly recitals + Trinity / ABRSM exam prep on request.',
    monthlyFeeZar: 1800,
    ageRangeYears: { min: 4, max: 18 },
    accentColor: '#fbcfe8',
    imageUrl: 'https://picsum.photos/seed/inst-sonata/600/360',
  },
  {
    id: 'inst_drumline_studios',
    name: 'Drumline Studios',
    kind: 'session',
    category: 'music',
    area: 'Greenside',
    city: 'Johannesburg',
    tagline: 'Drum kit + percussion ensemble for kids.',
    description:
      'Single-instrument focus on drum kit + auxiliary percussion. Ensemble jam sessions every other Saturday for the older kids.',
    monthlyFeeZar: 1600,
    ageRangeYears: { min: 6, max: 16 },
    accentColor: '#fcd34d',
    imageUrl: 'https://picsum.photos/seed/inst-drumline/600/360',
  },
  {
    id: 'inst_voicebox_choir',
    name: 'VoiceBox Children’s Choir',
    kind: 'session',
    category: 'music',
    area: 'Newlands',
    city: 'Cape Town',
    tagline: 'Choral training + 4 public performances a year.',
    description:
      'Three-tier choir (Cubs / Juniors / Seniors). Weekly rehearsals, Sunday warm-ups before performances. Auditioned entry from age 7.',
    monthlyFeeZar: 950,
    ageRangeYears: { min: 5, max: 15 },
    accentColor: '#fda4af',
    imageUrl: 'https://picsum.photos/seed/inst-voicebox/600/360',
  },

  // ── Art ────────────────────────────────────────────────────────────────
  {
    id: 'inst_brushstrokes',
    name: 'Brushstrokes Art Studio',
    kind: 'session',
    category: 'art',
    area: 'Morningside',
    city: 'Johannesburg',
    tagline: 'Mixed-media art classes with monthly themes.',
    description:
      'Painting, clay, collage and printmaking. Each month has a theme (sea life, self-portraits, etc.) and ends with a mini exhibition for parents.',
    monthlyFeeZar: 1100,
    ageRangeYears: { min: 4, max: 14 },
    accentColor: '#f9a8d4',
    imageUrl: 'https://picsum.photos/seed/inst-brushstrokes/600/360',
  },
  {
    id: 'inst_tinker_clay',
    name: 'Tinker Clay Studio',
    kind: 'session',
    category: 'art',
    area: 'Stellenbosch',
    city: 'Cape Town',
    tagline: 'Pottery wheel + hand-building for small hands.',
    description:
      'Pottery-only studio with kid-sized wheels and a low-fire kiln. Each term ends with a "fire & take home" day for finished pieces.',
    monthlyFeeZar: 1350,
    ageRangeYears: { min: 6, max: 14 },
    accentColor: '#fed7aa',
    imageUrl: 'https://picsum.photos/seed/inst-tinkerclay/600/360',
  },

  // ── Martial arts ────────────────────────────────────────────────────────
  {
    id: 'inst_kintaro_karate',
    name: 'Kintaro Karate Dojo',
    kind: 'session',
    category: 'martial_arts',
    area: 'Sandton',
    city: 'Johannesburg',
    tagline: 'Shotokan karate, traditional belt progression.',
    description:
      'Twice-weekly classes, formal belt gradings every 3 months. Strong emphasis on kata, etiquette and discipline.',
    monthlyFeeZar: 850,
    ageRangeYears: { min: 5, max: 16 },
    accentColor: '#fca5a5',
    imageUrl: 'https://picsum.photos/seed/inst-kintaro/600/360',
  },
  {
    id: 'inst_silverback_judo',
    name: 'Silverback Judo Club',
    kind: 'session',
    category: 'martial_arts',
    area: 'Hatfield',
    city: 'Pretoria',
    tagline: 'Olympic-style judo for juniors.',
    description:
      'Coached by a national-team alumnus. Focus on safe falls, throws and ground-work. Provincial competition pathway from age 8.',
    monthlyFeeZar: 750,
    ageRangeYears: { min: 6, max: 17 },
    accentColor: '#fdba74',
    imageUrl: 'https://picsum.photos/seed/inst-judo/600/360',
  },

  // ── Dance ───────────────────────────────────────────────────────────────
  {
    id: 'inst_pointe_ballet',
    name: 'Pointe Ballet Academy',
    kind: 'session',
    category: 'dance',
    area: 'Parkview',
    city: 'Johannesburg',
    tagline: 'RAD-syllabus ballet, primary through Grade 5.',
    description:
      'Royal Academy of Dance syllabus. Annual exams, end-of-year showcase at the Wits Theatre. Boys-only stream from Grade 1.',
    monthlyFeeZar: 1250,
    ageRangeYears: { min: 4, max: 16 },
    accentColor: '#f5d0fe',
    imageUrl: 'https://picsum.photos/seed/inst-pointe/600/360',
  },
  {
    id: 'inst_groove_hiphop',
    name: 'Groove Hip-Hop Crew',
    kind: 'session',
    category: 'dance',
    area: 'Maboneng',
    city: 'Johannesburg',
    tagline: 'Hip-hop choreography for kids and teens.',
    description:
      'Weekly choreographed routines, optional crew for end-of-year showcase. No prior experience needed for the Mini Crew (5-7 yrs).',
    monthlyFeeZar: 900,
    ageRangeYears: { min: 5, max: 17 },
    accentColor: '#c4b5fd',
    imageUrl: 'https://picsum.photos/seed/inst-groove/600/360',
  },

  // ── Sports ──────────────────────────────────────────────────────────────
  {
    id: 'inst_strikers_soccer',
    name: 'Strikers Junior Soccer',
    kind: 'session',
    category: 'sports',
    area: 'Edenvale',
    city: 'Johannesburg',
    tagline: 'Co-ed Saturday soccer development.',
    description:
      'Saturday-morning soccer development league. Mixed teams from u6 to u12 with friendlies against neighbouring clubs every other weekend.',
    monthlyFeeZar: 600,
    ageRangeYears: { min: 5, max: 12 },
    accentColor: '#86efac',
    imageUrl: 'https://picsum.photos/seed/inst-strikers/600/360',
  },
  {
    id: 'inst_topspin_tennis',
    name: 'TopSpin Junior Tennis',
    kind: 'session',
    category: 'sports',
    area: 'Durban North',
    city: 'Durban',
    tagline: 'Red-ball through full-court tennis.',
    description:
      'Coach-led groups of 4. Red-ball / orange-ball / green-ball progression. Termly internal tournaments with little trophies for everyone.',
    monthlyFeeZar: 1100,
    ageRangeYears: { min: 4, max: 14 },
    accentColor: '#bef264',
    imageUrl: 'https://picsum.photos/seed/inst-topspin/600/360',
  },

  // ── Robotics & coding ───────────────────────────────────────────────────
  {
    id: 'inst_codecubs',
    name: 'CodeCubs Junior',
    kind: 'session',
    category: 'robotics',
    area: 'Rosebank',
    city: 'Johannesburg',
    tagline: 'Scratch + LEGO Spike for primary kids.',
    description:
      'Project-based weekly classes. Younger kids work in Scratch, older in LEGO Spike with optional FLL-style team challenges.',
    monthlyFeeZar: 1350,
    ageRangeYears: { min: 7, max: 13 },
    accentColor: '#a5b4fc',
    imageUrl: 'https://picsum.photos/seed/inst-codecubs/600/360',
  },
  {
    id: 'inst_robotworks',
    name: 'RobotWorks Lab',
    kind: 'session',
    category: 'robotics',
    area: 'Centurion',
    city: 'Pretoria',
    tagline: 'Arduino + 3D printing for tweens & teens.',
    description:
      'Hands-on Arduino, soldering and 3D printing. Each term ends with a build-and-show; some students enter the SA national robotics challenge.',
    monthlyFeeZar: 1700,
    ageRangeYears: { min: 10, max: 17 },
    accentColor: '#93c5fd',
    imageUrl: 'https://picsum.photos/seed/inst-robotworks/600/360',
  },

  // ── Languages ───────────────────────────────────────────────────────────
  {
    id: 'inst_petit_francais',
    name: 'Petit Français',
    kind: 'session',
    category: 'language',
    area: 'Greenside',
    city: 'Johannesburg',
    tagline: 'Conversational French for ages 4-12.',
    description:
      'Small groups (max 6) of immersive conversational French. Songs, games and a yearly play. No textbooks until age 9.',
    monthlyFeeZar: 1100,
    ageRangeYears: { min: 4, max: 12 },
    accentColor: '#fcd34d',
    imageUrl: 'https://picsum.photos/seed/inst-petitfrancais/600/360',
  },
  {
    id: 'inst_mandarin_kids',
    name: 'Mandarin Kids Club',
    kind: 'session',
    category: 'language',
    area: 'Bedfordview',
    city: 'Johannesburg',
    tagline: 'Mandarin Chinese through stories & games.',
    description:
      'Storytelling-led Mandarin classes for primary kids. Native-speaker tutors. Optional HSK (level 1-3) prep for Grade 5+.',
    monthlyFeeZar: 1250,
    ageRangeYears: { min: 5, max: 13 },
    accentColor: '#fca5a5',
    imageUrl: 'https://picsum.photos/seed/inst-mandarin/600/360',
  },
];

/** Look up an institution by id; falls back to a synthetic record. */
export function institutionById(id: string): MockInstitution {
  return (
    MOCK_INSTITUTIONS.find((i) => i.id === id) ?? {
      id,
      name: id,
      kind: 'daycare',
      category: 'daycare',
      area: '—',
      city: '—',
      tagline: '',
      description: '',
      monthlyFeeZar: null,
      ageRangeYears: { min: 0, max: 18 },
      accentColor: '#e5e7eb',
      imageUrl: null,
    }
  );
}

/**
 * Convenience used by tests + the seed generator: just the kind, with a
 * sensible default for unknown ids.
 */
export function institutionKindOf(id: string): Phase0InstitutionKind {
  return institutionById(id).kind;
}
