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

// North Star steps. Orient/Voice-check wording is drawn from the brief and is
// PENDING STEVE'S APPROVAL against the full North Star lesson copy.
export const NORTH_STAR = {
  orient: [
    'Your IOTA North Star is a precise personal description of your life.',
    'It is not an affirmation, a motivational statement, or a goal.',
  ],
  discover: 'What do you want your life to look like when your Inner Organic Technology is activated and yours to direct?',
  write: 'Now write it in one or two sentences, as if your life is already like that.',
  voiceCheck: [
    'Read it aloud once.',
    'Revise it until it sounds true, natural, and like your own voice.',
  ],
  examples: [
    'My life is organized around what matters — my family, my work, my integrity — and it advances with clarity and force. There is a sense of expansion in how I live and what becomes possible.',
    'I experience depth, connection, and real contact with people and with life. There is a strong sense of aliveness and meaning in how I move through it.',
    'My energy is consistent, available, and directed. It supports a level of creation and engagement in my life that continues to expand.',
    'There is a clear direction in my life, and it is moving. What I take on evolves, builds, and opens into more.',
    'There is coherence between what I sense, what I choose, and how my life unfolds. It creates a level of alignment that continues to expand.',
  ],
};

/** Mighty counts characters; count Unicode code points so emoji count once. */
export function charCount(s: string): number {
  return Array.from(s).length;
}
