import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { getSession, unauthorized, assertSameOriginWrite, type Session } from './session';
import { rateLimit } from './ratelimit';
import { log } from './log';

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

type Handler = (req: NextRequest, s: Session) => Promise<NextResponse>;

/** Session-required route. Writes also get CSRF + rate limiting. */
export function withSession(handler: Handler, opts: { write?: boolean; route: string } = { route: 'unknown' }) {
  return async (req: NextRequest) => {
    try {
      if (opts.write) {
        const bad = assertSameOriginWrite(req);
        if (bad) return bad;
      }
      const s = await getSession(req);
      if (!s) return unauthorized();
      if (!rateLimit(`${opts.route}:${s.sessionId}`, opts.write ? 60 : 120, 60_000)) {
        return json({ error: 'rate_limited' }, 429);
      }
      return await handler(req, s);
    } catch {
      log.error('route.error', { route: opts.route });
      return json({ error: 'server_error' }, 500);
    }
  };
}
