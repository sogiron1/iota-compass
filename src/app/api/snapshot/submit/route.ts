import { tx } from '@/lib/db';
import { json, withSession } from '@/lib/http';
import { QUESTION_KEYS, MAX_CHARS, charCount } from '@/lib/content';
import { syncSnapshot } from '@/lib/sync';

export const dynamic = 'force-dynamic';

// Questions 1–7 are required; question 8 ("anything else") may be blank.
const REQUIRED = QUESTION_KEYS.filter((k) => k !== 'q8');

export const POST = withSession(
  async (_req, s) => {
    const outcome = await tx(s.memberId, async (c) => {
      const d = await c.query<{ draft_key: string; answer: string }>(
        `select draft_key, answer from drafts where draft_key = any($1::text[])`,
        [QUESTION_KEYS as unknown as string[]],
      );
      const answers = Object.fromEntries(d.rows.map((r) => [r.draft_key, r.answer.trim()]));
      const missing = REQUIRED.filter((k) => !answers[k]);
      if (missing.length) return { error: 'incomplete' as const, missing };
      if (QUESTION_KEYS.some((k) => charCount(answers[k] ?? '') > MAX_CHARS)) return { error: 'too_long' as const };
      // Creates the immutable baseline first (idempotent: an existing one wins).
      await c.query('select submit_baseline($1::jsonb)', [JSON.stringify(answers)]);
      return { ok: true as const };
    });
    if ('error' in outcome) return json(outcome, 400);

    // Then write each mapped Mighty field; success only if every field confirms.
    const state = await syncSnapshot(s.memberId, s.mightyMemberId);
    return json({ saved: true, sync: state });
  },
  { write: true, route: 'snapshot_submit' },
);
