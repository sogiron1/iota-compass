import { z } from 'zod';
import { json, withSession } from '@/lib/http';
import { getAccessToken } from '@/lib/credentials';
import { mightyGraphql, MightyApiError } from '@/lib/mighty/graphql';
import {
  UPDATE_ANSWER_MUTATION,
  OWN_ANSWER_QUERY,
  OTHER_MEMBER_RESPONSES_QUERY,
  readOwnAnswers,
  normalize,
} from '@/lib/mighty/operations';

export const dynamic = 'force-dynamic';

// STAGING-ONLY Phase 0 probe for the disposable test field. Returns 404 unless
// COMPASS_TEST_MODE=1 and COMPASS_TEST_FIELD_ID are set. Never echoes answer
// text: it returns pass/fail and safe error codes only. Remove after Phase 0.

const Body = z.object({
  action: z.enum(['whoami', 'write_own', 'read_own', 'write_other', 'read_other']),
  text: z.string().max(200).optional(),
  targetMemberId: z.string().max(100).optional(),
});

type Upd = { updateCustomFieldAnswer: { errors: unknown[]; response: { text: string | null; member: { id: string } | null } | null } | null };
type Read = { network: { customField: { answers: { nodes: { text: string | null }[] } } | null } | null };

export const POST = withSession(
  async (req, s) => {
    const fieldId = process.env.COMPASS_TEST_FIELD_ID;
    if (process.env.COMPASS_TEST_MODE !== '1' || !fieldId) return json({ error: 'not_found' }, 404);
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    const { action, text, targetMemberId } = parsed.data;
    if (action === 'whoami') return json({ mightyMemberId: s.mightyMemberId });

    const token = await getAccessToken(s.memberId);
    if (!token) return json({ result: 'needs_reconnect' });
    const target = action.endsWith('_other') ? targetMemberId : s.mightyMemberId;
    if (!target) return json({ error: 'bad_request' }, 400);

    try {
      if (action === 'write_own' || action === 'write_other') {
        const d = await mightyGraphql<Upd>(token, UPDATE_ANSWER_MUTATION, {
          input: { customFieldId: fieldId, memberId: target, text: text ?? 'dummy' },
        });
        const p = d.updateCustomFieldAnswer;
        const ok = !!p && (!p.errors || p.errors.length === 0) && normalize(p.response?.text ?? '') === normalize(text ?? 'dummy');
        return json({ result: ok ? 'write_succeeded' : 'write_rejected', mutationErrors: p?.errors?.length ?? null });
      }
      if (action === 'read_own') {
        const got = (await readOwnAnswers(token)).get(fieldId) ?? null;
        return json({
          result: got === null ? 'no_answer_visible' : 'answer_visible',
          matchesExpected: text && got !== null ? normalize(got) === normalize(text) : null,
        });
      }
      // read_other: try BOTH member-scoped paths; any visible text is a failure.
      const attempt = async <T,>(q: string, v: Record<string, unknown>, pick: (d: T) => string | null) => {
        try {
          const got = pick(await mightyGraphql<T>(token, q, v));
          return got === null ? 'no_answer_visible' : 'ANSWER_VISIBLE';
        } catch (e) {
          return `blocked:${e instanceof MightyApiError ? e.safeCode : 'UNKNOWN'}`;
        }
      };
      type Other = { node: { customFieldResponses?: { nodes: { text: string | null; customField: { id: string } | null }[] } } | null };
      const viaField = await attempt<Read>(OWN_ANSWER_QUERY, { fieldId, memberId: target }, (d) => d.network?.customField?.answers.nodes[0]?.text ?? null);
      const viaMember = await attempt<Other>(OTHER_MEMBER_RESPONSES_QUERY, { memberId: target }, (d) =>
        d.node?.customFieldResponses?.nodes.find((n) => n.customField?.id === fieldId)?.text ?? null,
      );
      return json({ result: viaField.startsWith('ANSWER') || viaMember.startsWith('ANSWER') ? 'LEAK' : 'no_leak', viaField, viaMember });
    } catch (e) {
      return json({ result: 'error', code: e instanceof MightyApiError ? e.safeCode : 'UNKNOWN' });
    }
  },
  { write: true, route: 'test_probe' },
);
