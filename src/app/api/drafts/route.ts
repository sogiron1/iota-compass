import { z } from 'zod';
import { tx } from '@/lib/db';
import { json, withSession } from '@/lib/http';
import { FIELD_KEYS, MAX_CHARS, charCount } from '@/lib/content';

export const dynamic = 'force-dynamic';

const Body = z.object({
  key: z.enum(FIELD_KEYS),
  answer: z.string().max(MAX_CHARS * 2), // UTF-16 upper bound; exact check below
});

export const PUT = withSession(
  async (req, s) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    const { key, answer } = parsed.data;
    if (charCount(answer) > MAX_CHARS) return json({ error: 'too_long', max: MAX_CHARS }, 400);

    const result = await tx(s.memberId, async (c) => {
      if (key !== 'north_star') {
        const sub = await c.query(`select 1 from snapshot_submissions where checkpoint = 'baseline'`);
        if (sub.rowCount) return 'locked' as const;
      }
      await c.query(
        `insert into drafts(member_id, draft_key, answer, updated_at) values ($1, $2, $3, now())
         on conflict (member_id, draft_key) do update set answer = excluded.answer, updated_at = now()`,
        [s.memberId, key, answer],
      );
      return 'saved' as const;
    });
    if (result === 'locked') return json({ error: 'baseline_submitted' }, 409);
    return json({ saved: true, at: new Date().toISOString() });
  },
  { write: true, route: 'drafts' },
);
