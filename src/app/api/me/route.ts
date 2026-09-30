import { tx } from '@/lib/db';
import { json, withSession } from '@/lib/http';
import { syncStatus } from '@/lib/sync';
import { getAccessToken } from '@/lib/credentials';
import { readOwnAnswer } from '@/lib/mighty/operations';

export const dynamic = 'force-dynamic';

export const GET = withSession(
  async (_req, s) => {
    const data = await tx(s.memberId, async (c) => {
      const drafts = await c.query<{ draft_key: string; answer: string }>('select draft_key, answer from drafts');
      const sub = await c.query<{ id: string; submitted_at: string }>(
        `select id, submitted_at from snapshot_submissions where checkpoint = 'baseline'`,
      );
      const answers = sub.rows[0]
        ? await c.query<{ question_key: string; answer: string }>(
            'select question_key, answer from snapshot_answers where submission_id = $1',
            [sub.rows[0].id],
          )
        : { rows: [] };
      const ns = await c.query<{ statement: string; version: number; created_at: string }>(
        'select statement, version, created_at from north_stars where is_active',
      );
      const map = await c.query<{ field_key: string }>(`select field_key from mighty_field_map where field_key = 'north_star'`);
      return {
        drafts: Object.fromEntries(drafts.rows.map((d) => [d.draft_key, d.answer])),
        baseline: sub.rows[0]
          ? { submittedAt: sub.rows[0].submitted_at, answers: Object.fromEntries(answers.rows.map((a) => [a.question_key, a.answer])) }
          : null,
        northStar: ns.rows[0] ?? null,
        hasNorthStarField: map.rows.length > 0,
      };
    });

    // Preload: if the member already has a North Star in Mighty and none here,
    // offer it as the starting draft (never auto-submitted).
    let mightyNorthStar: string | null = null;
    if (!data.northStar && !data.drafts.north_star && data.hasNorthStarField) {
      const token = await getAccessToken(s.memberId);
      if (token) {
        const fieldId = await tx(null, async (c) =>
          (await c.query<{ mighty_field_id: string }>(`select mighty_field_id from mighty_field_map where field_key = 'north_star'`)).rows[0]
            ?.mighty_field_id,
        );
        if (fieldId) mightyNorthStar = await readOwnAnswer(token, { customFieldId: fieldId, memberId: s.mightyMemberId });
      }
    }

    const sync = await syncStatus(s.memberId);
    return json({
      drafts: data.drafts,
      baseline: data.baseline,
      northStar: data.northStar,
      preload: { northStar: mightyNorthStar },
      sync,
    });
  },
  { route: 'me' },
);
