import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { tx } from '@/lib/db';
import { sha256 } from '@/lib/crypto';
import { assertSameOriginWrite, clearSessionCookie, createSession } from '@/lib/session';
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
  // The token lives only in the page's memory and is sent as a Bearer header.
  // Also purge any session cookie left by earlier builds.
  const res = json({ token });
  clearSessionCookie(res);
  return res;
}
