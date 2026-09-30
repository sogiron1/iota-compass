import { z } from 'zod';
import { tx } from '@/lib/db';
import { json, withSession } from '@/lib/http';
import { MAX_CHARS, charCount } from '@/lib/content';
import { syncNorthStar } from '@/lib/sync';

export const dynamic = 'force-dynamic';

const Body = z.object({ statement: z.string().min(1).max(MAX_CHARS * 2) });

export const POST = withSession(
  async (req, s) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    const statement = parsed.data.statement.trim();
    if (!statement) return json({ error: 'empty' }, 400);
    if (charCount(statement) > MAX_CHARS) return json({ error: 'too_long', max: MAX_CHARS }, 400);

    const saved = await tx(s.memberId, async (c) => {
      const cur = await c.query<{ statement: string }>('select statement from north_stars where is_active');
      if (cur.rows[0]?.statement === statement) return false; // unchanged: no new version
      await c.query('select save_north_star($1)', [statement]);
      await c.query(`delete from drafts where draft_key = 'north_star'`);
      return true;
    });

    const state = await syncNorthStar(s.memberId, s.mightyMemberId);
    return json({ saved: true, newVersion: saved, sync: state });
  },
  { write: true, route: 'north_star' },
);
