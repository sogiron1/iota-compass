// All member-facing program copy lives here. Snapshot intro, questions and
// North Star examples are Steve's supplied source text, unchanged in meaning.

export const MAX_CHARS = 2000; // Mighty long-text limit (docs, 2026-09-29)

export const QUESTION_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];
export const FIELD_KEYS = [...QUESTION_KEYS, 'north_star'] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const QUESTIONS: Record<QuestionKey, { prompt: string; fieldLabel: string }> = {
  q1: { prompt: 'What brought you to this program?', fieldLabel: 'IOTA Baseline 1 — What brought you here?' },
  q2: { prompt: 'What is working in your life right now?', fieldLabel: 'IOTA Baseline 2 — What is working?' },
  q3: { prompt: 'What isn’t?', fieldLabel: 'IOTA Baseline 3 — What isn’t working?' },
  q4: {
    prompt: 'What have you already tried in order to change how you experience your life?',
    fieldLabel: 'IOTA Baseline 4 — What have you tried?',
  },
  q5: { prompt: 'Where did it get you, and where did it stop?', fieldLabel: 'IOTA Baseline 5 — Where did it stop?' },
  q6: {
    prompt: 'What is the thing about yourself, or your life, that has stayed the same no matter what you have done about it?',
    fieldLabel: 'IOTA Baseline 6 — What has not moved?',
  },
  q7: { prompt: 'How long has it been that way?', fieldLabel: 'IOTA Baseline 7 — How long has it been?' },
  q8: {
    prompt: 'Is there anything else your facilitator should know about you before you walk in?',
    fieldLabel: 'IOTA Baseline 8 — For your facilitator',
  },
};

export const NORTH_STAR_FIELD_LABEL = 'My IOTA North Star';

// Your IOTA Baseline introduction. The first paragraph is Steve's approved
// framing (30 Sep); the rest is the supplied text, split into short sections.
// Internal keys (q1–q8, SNAPSHOT_*) are unchanged on purpose.
export const BASELINE_NAME = 'Your IOTA Baseline';
export const SNAPSHOT_INTRO: string[][] = [
  [
    'Your IOTA Baseline is an accurate record of where you are right now, before your Inner Organic Technology is activated. You will come back to it at the end of the IOTA Genesis Program.',
    'By the end of this program you will be operating from a baseline you have never had. Not an improved version of the one you are on now — a different one.',
    'Inner Organic Technology is a capacity evolution pre-engineered into human physiology and left dormant. This program activates it. What emerges is the Thrive State.',
    'This is not optimization. It is evolution.',
  ],
  [
    'Which is why we start here, with an accurate picture of where you are right now, before anything is activated.',
    'What you write here stays with us across the four weeks, informing how we meet you at different points in the program.',
    'Our work is activating your Inner Organic Technology. But we do that with a person, not a body, and knowing who you are makes us better at it.',
  ],
  [
    'And you will come back to this. At the end of the program you will read what you wrote today — from a hyper-resourced baseline you do not have yet. That is when it becomes most useful. Not now, when it is just an accurate account of where you are. Then, when you can see what is changing.',
    'Write plainly. There is no right answer and nobody is grading this.',
  ],
];

// IOTA North Star copy: Steve's approved lesson text (30 Sep 2026), arranged
// into two orientation screens and three steps. His Step 4 ("add it to your
// profile") happens automatically on save, so its wording is adapted for the
// saved screen.
export const NORTH_STAR = {
  orient: [
    {
      title: 'Your IOTA North Star',
      paragraphs: [
        'We are going to ask you to do one short exercise now that will shape every part of what comes next.',
        'It’s called your IOTA North Star. It’s a single, personal description of how your life is when your Inner Organic Technology is activated and you are directing it.',
        'Here’s why this matters.',
        'Activation is not abstract. As your IOTA activates over the four weeks ahead, your system begins to organize itself around something. The question is what. Without a clear orientation, your activated capacity will still produce real changes — but those changes will not necessarily move in the direction that matters most to you. With a clear orientation, your activated capacity organizes around that orientation, naturally and without force.',
        'The IOTA North Star is that orientation.',
      ],
    },
    {
      title: 'Before you write',
      paragraphs: [
        'It is not an affirmation. It is not a motivational statement. It is not a goal. It is a precise description of how you are when your system is operating at a higher level — written in your own voice, in your own language, true to your own life.',
        'And here is what to understand before you write it. The reason this may not be consistently expressed in your life yet is not a lack of effort or intention. It is that the underlying capacity required to sustain it has remained dormant. IOTA changes that. As IOTA activates, your system begins to organize around this naturally. You don’t need to force it or figure out how to make it happen. You simply need a clear orientation.',
        'That is the point. You are not writing a wish. You are writing the description of a life that your activated IOT will organize itself toward.',
        'The first clear answer is usually the right one. Don’t overthink it. Begin.',
      ],
    },
  ],
  discover: 'What do you want your life to look like when your Inner Organic Technology is activated and yours to direct?',
  discoverNote: 'Most people don’t need to think very hard about this. The answer is usually already there.',
  examplesIntro:
    'This is not an affirmation or a motivational statement. It is a concise description of how you are when your system is operating at a higher level.',
  examples: [
    'My life is organized around what matters — my family, my work, my integrity — and it advances with clarity and force. There is a sense of expansion in how I live and what becomes possible.',
    'I experience depth, connection, and real contact with people and with life. There is a strong sense of aliveness and meaning in how I move through it.',
    'My energy is consistent, available, and directed. It supports a level of creation and engagement in my life that continues to expand.',
    'There is a clear direction in my life, and it is moving. What I take on evolves, builds, and opens into more.',
    'There is coherence between what I sense, what I choose, and how my life unfolds. It creates a level of alignment that continues to expand.',
  ],
  write: 'Write one or two sentences as if your life is already like that. Don’t try to perfect it. The first clear answer is usually the right one.',
  voiceCheck: [
    'Read your sentence out loud once. Adjust the wording until it sounds exactly like something you would say — and something you can feel yourself living from.',
    'This isn’t about making it sound impressive. It’s about making it sound true, in your voice.',
    'If it feels generic, simplify it. If it sounds like you, keep it.',
  ],
  saveNote:
    'When you save, your IOTA North Star is added to your Mighty profile. It remains private to you unless you choose to share it.',
  saved: {
    title: 'Your IOTA North Star is set',
    paragraphs: [
      'It is now on your Mighty profile, private to you unless you choose to share it.',
      'Your North Star will be present with you throughout the program — read before each hands-on session and each daily practice, read again after, carried with you into your daily life. It will be accessible from anywhere in the platform.',
      'By the end of the four weeks, your system will already be organizing itself around what you wrote — the foundation laid, the direction clear, the work of living into it underway. And as you progress, you will feel something new: your North Star itself beginning to activate your IOT in real-life moments, calling the capacity forward exactly when your life requires it.',
    ],
    profileLinkText: 'See it in your private profile responses',
  },
};

/** Mighty counts characters; count Unicode code points so emoji count once. */
export function charCount(s: string): number {
  return Array.from(s).length;
}
