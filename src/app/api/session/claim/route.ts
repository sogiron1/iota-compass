import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { tx } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { assertSameOriginWrite, createSession, setSessionCookie } from '@/lib/session';
import { json } from '@/lib/http';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

const Body = z.object({ code: z.string().min(20).max(128) });

export async function POST(req: NextRequest) {
  const bad = assertSameOriginWrite(req);
  if (bad) return bad;
  if (!rateLimit(clientKey(req, 'claim'), 20, 60_000)) return json({ error: 'rate_limited' }, 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: 'bad_request' }, 400);

  const memberId = await tx(null, async (c) => {
    const r = await c.query<{ member_id: string }>(
      `update auth_handoffs set used_at = now()
        where code_hash = $1 and used_at is null and expires_at > now()
        returning member_id`,
      [sha256(parsed.data.code)],
    );
    return r.rows[0]?.member_id ?? null;
  });
  if (!memberId) return json({ error: 'expired' }, 400);

  const token = await createSession(memberId);
  // Token goes in an HttpOnly partitioned cookie AND back to the in-memory
  // client, which uses it as a Bearer header if the cookie is blocked.
  const res = json({ token });
  setSessionCookie(res, token, 'None');
  return res;
}
