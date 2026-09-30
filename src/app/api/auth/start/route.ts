import { NextResponse, type NextRequest } from 'next/server';
import { tx } from '@/lib/db';
import { encrypt, pkceChallenge, randomToken, sha256 } from '@/lib/crypto';
import { config } from '@/lib/config';
import { authorizeUrl } from '@/lib/mighty/oauth';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!rateLimit(clientKey(req, 'auth-start'), 20, 60_000)) {
    return new NextResponse('Too many attempts. Please wait a minute.', { status: 429 });
  }
  const m = req.nextUrl.searchParams.get('mode');
  const mode = m === 'popup' || m === 'iframe' ? m : 'redirect';
  const state = randomToken(32);
  const verifier = randomToken(48);
  await tx(null, async (c) => {
    await c.query(`delete from oauth_states where expires_at < now() - interval '1 day'`);
    await c.query(
      `insert into oauth_states(state_hash, verifier_enc, mode, expires_at)
       values ($1, $2, $3, now() + interval '10 minutes')`,
      [sha256(state), encrypt(verifier, config.tokenEncryptionKey), mode],
    );
  });
  return NextResponse.redirect(authorizeUrl(state, pkceChallenge(verifier)), {
    status: 302,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
