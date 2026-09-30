import { NextResponse, type NextRequest } from 'next/server';
import { tx } from '@/lib/db';
import { decrypt, randomToken, sha256 } from '@/lib/crypto';
import { config } from '@/lib/config';
import { exchangeCode, issuer, OAuthError } from '@/lib/mighty/oauth';
import { getViewerId } from '@/lib/mighty/operations';
import { storeTokens } from '@/lib/credentials';
import { log } from '@/lib/log';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { HANDOFF_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

function done(path: string) {
  // Relative-to-app redirect; never carries tokens or codes in the URL.
  return NextResponse.redirect(`${config.appBaseUrl}${path}`, {
    status: 303,
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}

export async function GET(req: NextRequest) {
  if (!rateLimit(clientKey(req, 'auth-cb'), 20, 60_000)) return done('/auth/complete?e=rate');
  const p = req.nextUrl.searchParams;
  const state = p.get('state');
  const code = p.get('code');
  const iss = p.get('iss');

  if (!state || state.length > 128) return done('/auth/complete?e=state');

  // Single-use, unexpired state (CSRF + replay protection).
  const st = await tx(null, async (c) => {
    const r = await c.query<{ verifier_enc: string; mode: 'popup' | 'redirect' | 'iframe' }>(
      `update oauth_states set used_at = now()
        where state_hash = $1 and used_at is null and expires_at > now()
        returning verifier_enc, mode`,
      [sha256(state)],
    );
    return r.rows[0];
  });
  if (!st) return done('/auth/complete?e=state');
  const mode = st.mode;

  if (p.get('error')) return done(`/auth/complete?e=cancelled&m=${mode}`);
  if (!code || code.length > 512) return done(`/auth/complete?e=code&m=${mode}`);
  // RFC 9207: reject responses from an unexpected issuer (mix-up defence).
  if (iss && iss.replace(/\/$/, '') !== issuer()) return done(`/auth/complete?e=issuer&m=${mode}`);

  try {
    const tokens = await exchangeCode(code, decrypt(st.verifier_enc, config.tokenEncryptionKey));
    // Identity comes only from Mighty, using the token we just obtained.
    const mightyMemberId = await getViewerId(tokens.access_token);

    const memberId = await tx(null, async (c) => {
      const r = await c.query<{ id: string }>(
        `insert into members(mighty_member_id) values ($1)
         on conflict (mighty_member_id) do update set connected_at = now(), disconnected_at = null
         returning id`,
        [mightyMemberId],
      );
      const id = r.rows[0].id;
      await storeTokens(c, id, tokens);
      return id;
    });

    if (mode === 'iframe' || mode === 'redirect') {
      // Sign-in happened inside the Mighty embed (or a top-level tab). Return a one-time, 2-minute
      // handoff code in the URL fragment: fragments are never sent to servers
      // or in Referer, and the client strips it immediately after claiming.
      const handoff = randomToken(32);
      await tx(null, (c) =>
        c.query(
          `insert into auth_handoffs(code_hash, member_id, expires_at) values ($1, $2, now() + interval '2 minutes')`,
          [sha256(handoff), memberId],
        ),
      );
      return done(`/#h=${handoff}`);
    }

    if (mode === 'popup') {
      // Hand the session to the embedded iframe via a one-time code delivered
      // by postMessage from /auth/complete (never via the URL).
      const handoff = randomToken(32);
      await tx(null, (c) =>
        c.query(
          `insert into auth_handoffs(code_hash, member_id, expires_at) values ($1, $2, now() + interval '2 minutes')`,
          [sha256(handoff), memberId],
        ),
      );
      const res = done('/auth/complete?m=popup');
      res.headers.append(
        'Set-Cookie',
        `${HANDOFF_COOKIE}=${handoff}; Path=/auth/complete; Max-Age=120; HttpOnly; Secure; SameSite=Lax`,
      );
      return res;
    }

    return done('/');
  } catch (e) {
    const code = e instanceof OAuthError ? e.safeCode : 'callback_failed';
    log.warn('auth.callback_failed', { code: code.slice(0, 40) });
    return done(`/auth/complete?e=exchange&m=${mode}`);
  }
}
