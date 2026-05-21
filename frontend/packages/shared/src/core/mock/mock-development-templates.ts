/**
 * Seed milestone templates.
 *
 * The South African Department of Basic Education publishes age-banded
 * developmental milestone catalogues that preschools / crèches /
 * aftercares use as the framework for their term-end assessments. The
 * full **2 – 3 years** template below is transcribed from the Woodlands
 * Preschool worked example so the renderer has a real, dense template
 * to test against; a smaller **3 – 4 years** stub demonstrates that the
 * renderer truly is template-agnostic.
 *
 * Adding a new template = appending another object to the array. No
 * code changes required anywhere else.
 */

import type {
  Phase0MilestoneSection,
  Phase0MilestoneTemplate,
  Phase0VitalField,
} from '../contracts/development-reports.phase0';

const STANDARD_VITALS: Phase0VitalField[] = [
  { id: 'height', label: 'Height', unit: 'cm', inputMode: 'decimal' },
  { id: 'weight', label: 'Weight', unit: 'kg', inputMode: 'decimal' },
];

/* ────────────────────────────────────────────────────────────────────────── */
/* SA-DBE 2 – 3 years                                                         */
/* (transcribed verbatim from the Woodlands Preschool term report)            */
/* ────────────────────────────────────────────────────────────────────────── */

const SA_DBE_2_TO_3_SECTIONS: Phase0MilestoneSection[] = [
  {
    id: 'wellbeing',
    label: 'Wellbeing',
    icon: 'favorite',
    intro:
      'Each child is unique and develops at their own pace; allow a few months either side of the time frame given.',
    comment: { enabled: false, label: '' },
    groups: [
      {
        id: 'wellbeing.nourished',
        label: 'Well-nourished',
        items: [
          { id: 'wb.nu.asks_food', label: 'Asks for food or drink when hungry or thirsty' },
          { id: 'wb.nu.no_spill', label: 'Able to handle food and drink without spilling it' },
          { id: 'wb.nu.manners', label: 'Has good table manners' },
          { id: 'wb.nu.textures', label: 'Eats different textured foods' },
        ],
      },
      {
        id: 'wellbeing.hygiene',
        label: 'Health and Hygiene',
        items: [
          { id: 'wb.hh.wash_hands', label: 'Able to wash and dry his/her hands independently' },
          { id: 'wb.hh.verbalises_toilet', label: 'Verbalises when he/she wants to go to the toilet' },
          { id: 'wb.hh.toilet_day', label: 'Has mastered toilet training during the day' },
          { id: 'wb.hh.blow_nose', label: 'Blows own nose' },
        ],
      },
      {
        id: 'wellbeing.safe',
        label: 'Safe and Secure',
        items: [
          { id: 'wb.ss.adapted', label: 'Well adapted to school – follows routines' },
          { id: 'wb.ss.warnings', label: 'Listens and reacts to warnings' },
          { id: 'wb.ss.participates', label: 'Participates in activities inside and outside of the class' },
          { id: 'wb.ss.resilient', label: 'Strong and resilient to daily stresses' },
          {
            id: 'wb.ss.tantrums',
            label:
              'Manages temper-tantrums when struggling to perform certain tasks',
          },
          { id: 'wb.ss.evaluates_risk', label: 'Evaluates and reacts on certain risks and hazards' },
          { id: 'wb.ss.solutions', label: 'Investigates more than one solution to a problem' },
        ],
      },
    ],
  },

  {
    id: 'gross_motor',
    label: 'Gross Motor',
    icon: 'directions_run',
    comment: { enabled: false, label: '' },
    groups: [
      {
        id: 'gm.skills',
        label: 'Movement and balance',
        items: [
          { id: 'gm.jump_one_leg', label: 'Jumps on 1 leg for 3 steps' },
          { id: 'gm.walk_toes', label: 'Able to walk on toes for 2 steps' },
          { id: 'gm.throw_overhand', label: 'Throws overhand – in a specific direction' },
          { id: 'gm.throw_no_fall', label: 'Able to throw a ball without falling over' },
          { id: 'gm.walk_sideways', label: 'Walks sideways' },
          { id: 'gm.balance_heels_toes', label: 'Keeps balance when standing on heels or toes' },
          { id: 'gm.jump_step', label: 'Jumps with both feet from a low step' },
          {
            id: 'gm.catch_misses',
            label:
              'Able to catch a ball, with straight arms, against the body – misses often',
          },
          { id: 'gm.kick_15m', label: 'Able to kick a ball – approximately 1.5 m' },
          {
            id: 'gm.kick_target',
            label: 'Able to kick a ball towards a big target (without being too far off target)',
          },
          { id: 'gm.kick_balance', label: 'Kicks a big ball without losing balance' },
          { id: 'gm.climb_object', label: 'Climbs over an object' },
        ],
      },
    ],
  },

  {
    id: 'fine_motor',
    label: 'Fine Motor',
    icon: 'pan_tool',
    comment: { enabled: false, label: '' },
    groups: [
      {
        id: 'fm.skills',
        label: 'Hand and finger control',
        items: [
          { id: 'fm.pegboard', label: 'Able to insert pins in a pegboard' },
          { id: 'fm.lids', label: 'Turns lids to open and close a container / jar' },
          { id: 'fm.pages', label: 'Able to turn pages of a book' },
          { id: 'fm.drawers', label: 'Able to open drawers' },
          { id: 'fm.handles', label: 'Able to turn handles' },
          { id: 'fm.tower', label: 'Builds a 6 – 10 block tower' },
          { id: 'fm.beads', label: 'Able to thread 6 big beads' },
        ],
      },
    ],
  },

  {
    id: 'sensory',
    label: 'Sensory System',
    icon: 'visibility',
    comment: { enabled: true, label: 'Comment' },
    groups: [
      {
        id: 'sn.vision',
        label: 'Vision',
        items: [
          { id: 'sn.v.faces', label: 'I can recognise familiar faces' },
          { id: 'sn.v.landmarks', label: 'I can recognise landmarks e.g. church / shop' },
          { id: 'sn.v.recall_objects', label: 'I can recall 2 or more objects seen' },
          { id: 'sn.v.puzzle_12', label: 'Can manipulate shapes and builds a 12 piece puzzle' },
          { id: 'sn.v.moving_object', label: 'Watches a moving object without moving head' },
          { id: 'sn.v.sort_property', label: 'Sorts objects according to at least one property' },
        ],
      },
      {
        id: 'sn.auditory',
        label: 'Auditory',
        items: [
          { id: 'sn.a.recall_3', label: 'Recalls 3 numbers – 1/3 attempts correct' },
          { id: 'sn.a.freeze', label: 'Freezes or stops on instruction / game' },
          { id: 'sn.a.songs', label: 'Enjoys songs and rhymes' },
          { id: 'sn.a.repeat_rhymes', label: 'Recalls and repeats some rhymes and songs' },
          {
            id: 'sn.a.last_word',
            label:
              'Completes the last word of a sentence, song or rhyme if omitted',
          },
          { id: 'sn.a.soft_loud', label: 'Speaks soft or loud' },
        ],
      },
      {
        id: 'sn.tactile',
        label: 'Tactile',
        items: [
          {
            id: 'sn.t.eyes_closed',
            label:
              'I can vocalise the area where my body was touched while my eyes are closed',
          },
          {
            id: 'sn.t.blindfold',
            label:
              'I can recognise objects by using my hands only (while blindfolded)',
          },
          { id: 'sn.t.food_textures', label: 'I can recognise textures of food' },
        ],
      },
    ],
  },

  {
    id: 'social_emotional',
    label: 'Social and Emotional',
    icon: 'mood',
    comment: { enabled: true, label: 'Comment' },
    groups: [
      {
        id: 'se.social',
        label: 'Social skills — aware of own abilities',
        items: [
          {
            id: 'se.s.parallel',
            label:
              'Parallel play (plays alongside other children – not with them)',
          },
          { id: 'se.s.names', label: 'Remembers names' },
          { id: 'se.s.turn_taking', label: 'Understand turn-taking when having a conversation' },
          { id: 'se.s.give_take', label: 'Starting to understand the concept of give and take' },
          { id: 'se.s.group', label: 'Participates in simple group activities' },
          { id: 'se.s.belongings', label: 'Aware of own belongings' },
        ],
      },
      {
        id: 'se.life',
        label: 'Life skills — identity and self-help',
        items: [
          { id: 'se.l.undress', label: 'I am able to take off my shoes, socks and pants' },
          { id: 'se.l.shoes_on', label: 'I can put on my own shoes' },
          { id: 'se.l.jacket_on', label: 'I can put on my own jacket' },
          { id: 'se.l.buttons', label: 'I can undo big buttons' },
          { id: 'se.l.zip', label: 'I can undo a zip' },
          { id: 'se.l.name_surname', label: 'Able to say name and surname when asked' },
          { id: 'se.l.show_age', label: 'I am able to say and show my age on my fingers' },
          {
            id: 'se.l.body_parts',
            label:
              'I am able to identify and name body parts on self and others',
            hint: 'nose, eyes, mouth, hands, toes, teeth, head, arms, legs, back, stomach, feet, ears, hair',
          },
          { id: 'se.l.draw_body', label: 'I can draw a simple picture of a body image' },
        ],
      },
      {
        id: 'se.emotional',
        label: 'Emotional skills — relationships and respect',
        items: [
          { id: 'se.e.smiles', label: 'Smiles at other people' },
          { id: 'se.e.approval', label: 'I seek approval from others' },
          {
            id: 'se.e.initiate',
            label: 'I initiate interaction and physical contact e.g. giving hugs',
          },
          { id: 'se.e.ask_help', label: 'Asks for help from others' },
        ],
      },
      {
        id: 'se.group_identity',
        label: 'Group identity, differences and spiritual growth',
        items: [
          { id: 'se.g.prayer', label: 'Sings prayer before eating' },
          { id: 'se.g.differences', label: 'I am starting to realise that we are all different' },
          { id: 'se.g.genders', label: 'I am aware and can identify different genders' },
          { id: 'se.g.willing', label: 'I am willing to play with others' },
        ],
      },
    ],
  },

  {
    id: 'communication',
    label: 'Communication — Language, Pre-reading and Pre-writing',
    icon: 'forum',
    comment: { enabled: true, label: 'Comment' },
    groups: [
      {
        id: 'co.communication',
        label: 'Communication skills',
        items: [
          { id: 'co.c.me', label: 'I talk about myself as me and not e.g. James' },
          { id: 'co.c.three_word', label: 'Starts to talk – 3 word sentences' },
          {
            id: 'co.c.verbalise',
            label:
              'I can verbalise my immediate behaviour / actions / situations (e.g. I drink water)',
          },
          {
            id: 'co.c.negative',
            label: 'I can use negative phrases e.g. I won\u2019t / I can\u2019t',
          },
          { id: 'co.c.plurals', label: 'I am using plurals' },
          {
            id: 'co.c.pronouns',
            label:
              'I am using personal pronouns – "me, mine and yours" and understand the concept of "I, me and you"',
          },
          { id: 'co.c.adjectives', label: 'I use simple adjectives' },
          { id: 'co.c.sequence', label: 'I can sequence events in the correct order' },
        ],
      },
      {
        id: 'co.listening',
        label: 'Emergent listening and auditory skills',
        items: [
          { id: 'co.l.questions', label: 'I understand questions: what? / where? / who?' },
          { id: 'co.l.no_dont', label: 'I understand no / don\u2019t / can\u2019t' },
          { id: 'co.l.commands', label: 'Understands simple questions and commands' },
          { id: 'co.l.stories', label: 'Enjoys listening to stories' },
          { id: 'co.l.answer_story', label: 'Able to answer 1 question correct after listening to a story' },
          { id: 'co.l.loud_soft', label: 'Distinguishes between loud and soft sounds' },
        ],
      },
      {
        id: 'co.reading',
        label: 'Emergent reading',
        items: [
          { id: 'co.r.read_to', label: 'I enjoy being read to' },
          {
            id: 'co.r.short_stories',
            label:
              'I am able to listen to short stories, poems and rhymes for at least 2-3 minutes',
          },
          { id: 'co.r.name_pictures', label: 'I can name 7-11 pictures correctly' },
          { id: 'co.r.name_actions', label: 'I can name 3-7 actions correctly' },
          { id: 'co.r.text_pictures', label: 'I am able to distinguish between text and pictures' },
          { id: 'co.r.pretend', label: 'I pretend to "read" books' },
          { id: 'co.r.show_objects', label: 'Show familiar objects in a book or magazine' },
        ],
      },
      {
        id: 'co.writing',
        label: 'Emergent writing',
        items: [
          { id: 'co.w.painting', label: 'Enjoys painting' },
          {
            id: 'co.w.digital_grasp',
            label: 'Has a digital grasp',
            hint: 'Holds the pencil with the tips of all fingers — a precursor to the tripod grip.',
          },
          { id: 'co.w.fingers', label: 'Grasps the pencil/crayon with his/her fingers' },
          { id: 'co.w.lines', label: 'Starting to draw straight and circular lines' },
          { id: 'co.w.copy_lines', label: 'Copies horizontal & vertical lines' },
          { id: 'co.w.dominance', label: 'Hand dominance is clear' },
          { id: 'co.w.names_scribbles', label: 'Names own scribbles' },
          { id: 'co.w.scribble', label: 'Starts to scribble, purposefully, with a crayon' },
        ],
      },
    ],
  },

  {
    id: 'mathematics',
    label: 'Exploring Mathematics — Cognitive Development',
    icon: 'calculate',
    comment: { enabled: true, label: 'Comment' },
    groups: [
      {
        id: 'ma.numbers',
        label: 'Respond to numbers and counting',
        items: [
          { id: 'ma.n.count_5', label: 'Counts up to 5' },
          { id: 'ma.n.show_age', label: 'Shows age on fingers' },
          { id: 'ma.n.many_few', label: 'Knows the difference between many & few' },
          { id: 'ma.n.one_for_you', label: 'Plays "one for you, one for me"' },
        ],
      },
      {
        id: 'ma.sort',
        label: 'Sort, classify and compare',
        items: [
          { id: 'ma.s.groups', label: 'Groups / sorts known objects together' },
          { id: 'ma.s.id_colours', label: 'Identifies & names 6 colours' },
          { id: 'ma.s.match_colours', label: 'Matches 6 colours' },
          {
            id: 'ma.s.recognise_familiar',
            label: 'Able to recognise and identify familiar objects / pictures',
          },
          {
            id: 'ma.s.concepts',
            label:
              'Knows and distinguishes between two of: big & small, short & long, fat & thin, full & empty, many & few, near & far',
          },
        ],
      },
      {
        id: 'ma.shape',
        label: 'Explore form, shape and space',
        items: [
          { id: 'ma.sh.discriminate', label: 'Able to discriminate between a circle and square' },
          { id: 'ma.sh.match', label: 'Matches circles, triangles, squares, rectangles' },
          { id: 'ma.sh.id_shapes', label: 'Identifies & names 6 shapes' },
          { id: 'ma.sh.copy_circle', label: 'Copies a circle' },
          {
            id: 'ma.sh.spatial_self',
            label:
              'Understands concepts – up, under, in front, behind, on top in relation to self',
          },
          {
            id: 'ma.sh.spatial_perform',
            label: 'Understands and performs spatial concepts like up, under, next to, etc.',
          },
        ],
      },
    ],
  },

  {
    id: 'creative',
    label: 'Creative Thinking',
    icon: 'palette',
    comment: { enabled: true, label: 'Comment' },
    groups: [
      {
        id: 'cr.imaginary',
        label: 'Creativity — imaginary play, visual arts, music, dance, drama, baking and making',
        items: [
          { id: 'cr.i.develops', label: 'Creativity starts to develop' },
          { id: 'cr.i.copies_song', label: 'Copies actions while singing a song' },
          {
            id: 'cr.i.imaginary_play',
            label: 'Imaginary play with e.g. telephone, hair dryer, etc.',
          },
        ],
      },
    ],
  },

  {
    id: 'world',
    label: 'Understanding of the World',
    icon: 'public',
    comment: { enabled: true, label: 'Comment' },
    groups: [
      {
        id: 'wo.science',
        label: 'Science and technology',
        items: [
          {
            id: 'wo.s.cause_effect',
            label:
              'Starting to understand cause and effect: e.g. pushes a button – light goes off',
          },
          { id: 'wo.s.day_night', label: 'Starting to understand the time concept of day / night' },
        ],
      },
    ],
  },
];

const SA_DBE_2_TO_3: Phase0MilestoneTemplate = {
  id: 'tmpl_sa_dbe_2to3y',
  version: 1,
  authority: 'South African DBE',
  ageBand: { label: '2 – 3 years', minMonths: 24, maxMonths: 47 },
  effectiveFrom: '2024-01-01',
  responseType: 'tri_state',
  vitals: STANDARD_VITALS,
  sections: SA_DBE_2_TO_3_SECTIONS,
  closingComment: { enabled: true, label: 'Closing comment' },
};

/* ────────────────────────────────────────────────────────────────────────── */
/* SA-DBE 3 – 4 years (smaller stub — proves the renderer is template-agnostic) */
/* ────────────────────────────────────────────────────────────────────────── */

const SA_DBE_3_TO_4: Phase0MilestoneTemplate = {
  id: 'tmpl_sa_dbe_3to4y',
  version: 1,
  authority: 'South African DBE',
  ageBand: { label: '3 – 4 years', minMonths: 36, maxMonths: 59 },
  effectiveFrom: '2024-01-01',
  responseType: 'tri_state',
  vitals: STANDARD_VITALS,
  closingComment: { enabled: true, label: 'Closing comment' },
  sections: [
    {
      id: 'wellbeing',
      label: 'Wellbeing',
      icon: 'favorite',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'wb.independence',
          label: 'Independence and self-care',
          items: [
            { id: 'wb.i.dress', label: 'Dresses self with minimal help' },
            { id: 'wb.i.toilet_night', label: 'Mostly dry through the night' },
            { id: 'wb.i.utensils', label: 'Uses cutlery without spilling' },
            { id: 'wb.i.tidy', label: 'Tidies up own work area when prompted' },
          ],
        },
      ],
    },
    {
      id: 'motor',
      label: 'Motor Skills',
      icon: 'directions_run',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'mt.gross',
          label: 'Gross motor',
          items: [
            { id: 'mt.g.hop', label: 'Hops on one foot for several steps' },
            { id: 'mt.g.tricycle', label: 'Pedals a tricycle' },
            { id: 'mt.g.stairs', label: 'Walks up and down stairs alternating feet' },
            { id: 'mt.g.catch_two', label: 'Catches a bouncing ball with two hands' },
          ],
        },
        {
          id: 'mt.fine',
          label: 'Fine motor',
          items: [
            { id: 'mt.f.scissors', label: 'Uses scissors to cut along a line' },
            { id: 'mt.f.tripod', label: 'Beginning to use a tripod pencil grip' },
            { id: 'mt.f.draw_person', label: 'Draws a person with at least 3 body parts' },
          ],
        },
      ],
    },
    {
      id: 'language',
      label: 'Language and Communication',
      icon: 'forum',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'la.expressive',
          label: 'Expressive language',
          items: [
            { id: 'la.e.sentences', label: 'Uses 4 – 5 word sentences' },
            { id: 'la.e.story', label: 'Tells a short story about something that happened' },
            { id: 'la.e.questions', label: 'Asks "why" and "how" questions' },
          ],
        },
      ],
    },
  ],
};

/* ────────────────────────────────────────────────────────────────────────── */
/* SA-DBE Foundation Phase (5 – 7 years)                                      */
/*                                                                            */
/* Used by aftercare programmes for Grade R – Grade 3 learners. Sections      */
/* mirror the Foundation Phase CAPS subject blocks: Wellbeing, Personal &     */
/* Social, Language & Literacy, Numeracy, Life Skills, Creative Arts.        */
/* ────────────────────────────────────────────────────────────────────────── */

const SA_DBE_FOUNDATION: Phase0MilestoneTemplate = {
  id: 'tmpl_sa_dbe_foundation',
  version: 1,
  authority: 'South African DBE',
  ageBand: { label: '5 – 8 years (Foundation Phase)', minMonths: 60, maxMonths: 107 },
  effectiveFrom: '2024-01-01',
  responseType: 'tri_state',
  vitals: STANDARD_VITALS,
  closingComment: { enabled: true, label: 'Closing comment' },
  sections: [
    {
      id: 'wellbeing',
      label: 'Wellbeing',
      icon: 'favorite',
      intro:
        'Health, hygiene, independence and emotional regulation expected at Foundation Phase.',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'wb.self_care',
          label: 'Self-care and routine',
          items: [
            { id: 'wb.sc.dress', label: 'Dresses and undresses independently, including buttons and zips' },
            { id: 'wb.sc.toilet', label: 'Manages own toileting and hand washing without prompting' },
            { id: 'wb.sc.tidy', label: 'Packs own bag and keeps personal belongings together' },
            { id: 'wb.sc.lunch', label: 'Eats lunch independently and tidies up afterwards' },
          ],
        },
        {
          id: 'wb.regulation',
          label: 'Emotional regulation',
          items: [
            { id: 'wb.r.calm', label: 'Uses words instead of physical reactions when frustrated' },
            { id: 'wb.r.help', label: 'Asks an adult for help when needed' },
            { id: 'wb.r.transitions', label: 'Settles into transitions between activities calmly' },
            { id: 'wb.r.routine', label: 'Follows the daily routine with minimal reminders' },
          ],
        },
      ],
    },
    {
      id: 'personal_social',
      label: 'Personal & Social',
      icon: 'groups',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'ps.peers',
          label: 'Working with peers',
          items: [
            { id: 'ps.p.share', label: 'Shares materials and takes turns during group work' },
            { id: 'ps.p.cooperate', label: 'Co-operates within a small group to complete a task' },
            { id: 'ps.p.kindness', label: 'Shows kindness and empathy when a friend is upset' },
            { id: 'ps.p.conflict', label: 'Resolves small disagreements with adult guidance' },
          ],
        },
        {
          id: 'ps.identity',
          label: 'Identity and confidence',
          items: [
            { id: 'ps.i.intro', label: 'Introduces self confidently to a familiar adult' },
            { id: 'ps.i.opinions', label: 'Expresses opinions and preferences in class discussions' },
            { id: 'ps.i.responsibilities', label: 'Takes responsibility for a small classroom job' },
            { id: 'ps.i.respect', label: 'Shows respect for cultural differences in the group' },
          ],
        },
      ],
    },
    {
      id: 'language',
      label: 'Language & Literacy',
      icon: 'menu_book',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'la.listen',
          label: 'Listening and speaking',
          items: [
            { id: 'la.l.instructions', label: 'Follows multi-step verbal instructions' },
            { id: 'la.l.retell', label: 'Retells a story in the correct sequence' },
            { id: 'la.l.discuss', label: 'Participates meaningfully in class discussions' },
          ],
        },
        {
          id: 'la.read',
          label: 'Reading',
          items: [
            { id: 'la.r.sounds', label: 'Identifies letter sounds and blends them into simple words' },
            { id: 'la.r.sight', label: 'Reads age-appropriate sight-word texts independently' },
            { id: 'la.r.comprehension', label: 'Answers comprehension questions about a text just read' },
            { id: 'la.r.choose', label: 'Chooses books to read for enjoyment' },
          ],
        },
        {
          id: 'la.write',
          label: 'Writing',
          items: [
            { id: 'la.w.tripod', label: 'Holds the pencil with a comfortable tripod grip' },
            { id: 'la.w.case', label: 'Writes upper- and lower-case letters legibly' },
            { id: 'la.w.sentence', label: 'Writes a complete sentence with a capital and full stop' },
            { id: 'la.w.story', label: 'Writes a short story or recount of 3 – 5 sentences' },
          ],
        },
      ],
    },
    {
      id: 'numeracy',
      label: 'Numeracy',
      icon: 'calculate',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'nu.count',
          label: 'Number and counting',
          items: [
            { id: 'nu.c.count_100', label: 'Counts forwards and backwards to 100' },
            { id: 'nu.c.recognise', label: 'Recognises and writes numerals 0 – 100' },
            { id: 'nu.c.before_after', label: 'Knows the number before and after a given number' },
          ],
        },
        {
          id: 'nu.ops',
          label: 'Operations',
          items: [
            { id: 'nu.o.add', label: 'Adds within 20 using objects, fingers or mental strategies' },
            { id: 'nu.o.subtract', label: 'Subtracts within 20 with confidence' },
            { id: 'nu.o.word_problems', label: 'Solves simple one-step word problems' },
            { id: 'nu.o.skip', label: 'Skip-counts in 2s, 5s and 10s' },
          ],
        },
        {
          id: 'nu.measure',
          label: 'Shape, space and measurement',
          items: [
            { id: 'nu.m.shapes', label: 'Names and describes 2-D and 3-D shapes' },
            { id: 'nu.m.length', label: 'Compares and orders objects by length, mass and capacity' },
            { id: 'nu.m.time', label: 'Reads time on the hour and half-hour' },
            { id: 'nu.m.money', label: 'Recognises South African coins and notes' },
          ],
        },
      ],
    },
    {
      id: 'life_skills',
      label: 'Life Skills',
      icon: 'science',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'ls.world',
          label: 'World around us',
          items: [
            { id: 'ls.w.seasons', label: 'Names the four seasons and their key features' },
            { id: 'ls.w.community', label: 'Identifies community helpers and what they do' },
            { id: 'ls.w.recycle', label: 'Sorts waste into recyclables and rubbish' },
          ],
        },
        {
          id: 'ls.body',
          label: 'Body and safety',
          items: [
            { id: 'ls.b.healthy_food', label: 'Identifies healthy versus less healthy foods' },
            { id: 'ls.b.road', label: 'Knows basic road-safety rules' },
            { id: 'ls.b.private', label: 'Understands the difference between safe and unsafe touch' },
          ],
        },
      ],
    },
    {
      id: 'creative',
      label: 'Creative Arts',
      icon: 'palette',
      comment: { enabled: true, label: 'Comment' },
      groups: [
        {
          id: 'cr.making',
          label: 'Visual arts and making',
          items: [
            { id: 'cr.m.cut_paste', label: 'Cuts, pastes and assembles materials with care' },
            { id: 'cr.m.represent', label: 'Draws or paints a recognisable representation of self / family' },
            { id: 'cr.m.colour_mix', label: 'Experiments with mixing primary colours' },
          ],
        },
        {
          id: 'cr.perform',
          label: 'Music and performance',
          items: [
            { id: 'cr.p.rhythm', label: 'Keeps a steady beat using body or instruments' },
            { id: 'cr.p.songs', label: 'Sings 2 – 3 songs from memory in the group' },
            { id: 'cr.p.role_play', label: 'Takes a role in a short class drama or role-play' },
          ],
        },
      ],
    },
  ],
};

/* ────────────────────────────────────────────────────────────────────────── */
/* Store + reads                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export const MOCK_DEVELOPMENT_TEMPLATES: Phase0MilestoneTemplate[] = [
  SA_DBE_2_TO_3,
  SA_DBE_3_TO_4,
  SA_DBE_FOUNDATION,
];

/** Look up a template by id and version (defaults to highest version). */
export function findMilestoneTemplate(
  id: string,
  version?: number,
): Phase0MilestoneTemplate | undefined {
  const matches = MOCK_DEVELOPMENT_TEMPLATES.filter((t) => t.id === id);
  if (matches.length === 0) return undefined;
  if (version != null) return matches.find((t) => t.version === version);
  return matches.sort((a, b) => b.version - a.version)[0];
}

/**
 * Suggest the templates that apply to a child of the given DOB. Returns
 * all matching templates (newest version first) plus an explicit
 * `'fallback'` set when no band matches — handy so the staff form can
 * always pick something.
 */
export function templatesForChild(dob: string): Phase0MilestoneTemplate[] {
  const months = monthsSince(dob);
  const matching = MOCK_DEVELOPMENT_TEMPLATES.filter(
    (t) => months >= t.ageBand.minMonths && months <= t.ageBand.maxMonths,
  );
  if (matching.length === 0) return [...MOCK_DEVELOPMENT_TEMPLATES];
  return matching;
}

/** All templates (read-only copy), most recently effective first. */
export function listMilestoneTemplates(): Phase0MilestoneTemplate[] {
  return [...MOCK_DEVELOPMENT_TEMPLATES].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? 1 : -1,
  );
}

function monthsSince(isoDate: string): number {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  const months =
    (now.getUTCFullYear() - d.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - d.getUTCMonth()) -
    (now.getUTCDate() < d.getUTCDate() ? 1 : 0);
  return Math.max(0, months);
}
