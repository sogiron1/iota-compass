import 'server-only';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { tx } from './db';
import { randomToken, sha256 } from './crypto';
import { config } from './config';

export const SESSION_COOKIE = '__Host-compass_session';
// __Secure- (not __Host-) because it is scoped to Path=/auth/complete.
export const HANDOFF_COOKIE = '__Secure-compass_handoff';
// Sessions live only in the page's memory (Bearer header). Every fresh open of
// IOTA Compass re-verifies the member with Mighty, so a shared browser can never
// show one member's answers to the next Mighty user. 12 hours covers one sitting.
const SESSION_TTL_HOURS = 12;

export type Session = { sessionId: string; memberId: string; mightyMemberId: string };

/** Creates a session and returns the raw token (only ever sent to the client once). */
export async function createSession(memberId: string): Promise<string> {
  const token = randomToken(32);
  await tx(null, (c) =>
    c.query(
      `insert into app_sessions(token_hash, member_id, expires_at)
       values ($1, $2, now() + ($3 || ' hours')::interval)`,
      [sha256(token), memberId, String(SESSION_TTL_HOURS)],
    ),
  );
  return token;
}

function tokenFrom(req: NextRequest): string | null {
  // Bearer only. Session cookies are no longer issued or accepted: a cookie
  // outlives a Mighty account switch in the same browser.
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || null;
  return null;
}

export async function getSession(req: NextRequest): Promise<Session | null> {
  const token = tokenFrom(req);
  if (!token || token.length > 128) return null;
  const r = await tx(null, (c) =>
    c.query<{ id: string; member_id: string; mighty_member_id: string }>(
      `select s.id, s.member_id, m.mighty_member_id
         from app_sessions s join members m on m.id = s.member_id
        where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()
          and m.disconnected_at is null`,
      [sha256(token)],
    ),
  );
  const row = r.rows[0];
  return row ? { sessionId: row.id, memberId: row.member_id, mightyMemberId: row.mighty_member_id } : null;
}

export async function revokeSession(sessionId: string) {
  await tx(null, (c) => c.query('update app_sessions set revoked_at = now() where id = $1', [sessionId]));
}

/** Removes session cookies issued by earlier builds. */
export function clearSessionCookie(res: NextResponse) {
  res.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`);
  res.headers.append('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}

/**
 * CSRF defence for state-changing routes: requires our custom header (forces a
 * CORS preflight that we never approve cross-origin) and a same-origin Origin.
 */
export function assertSameOriginWrite(req: NextRequest): NextResponse | null {
  if (req.headers.get('x-compass-request') !== '1') {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  const origin = req.headers.get('origin');
  if (origin && origin !== config.appOrigin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return null;
}

export function unauthorized() {
  return NextResponse.json({ error: 'not_connected' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
