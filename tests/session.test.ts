import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const txSpy = vi.fn();
vi.mock('../src/lib/db', () => ({ tx: (...a: unknown[]) => txSpy(...a) }));

import { NextRequest } from 'next/server';
import { getSession, SESSION_COOKIE } from '../src/lib/session';

describe('session lookup', () => {
  it('ignores session cookies (a cookie outlives a Mighty account switch)', async () => {
    const req = new NextRequest('https://iota-compass.vercel.app/api/me', {
      headers: { cookie: `${SESSION_COOKIE}=${'a'.repeat(43)}` },
    });
    expect(await getSession(req)).toBeNull();
    expect(txSpy).not.toHaveBeenCalled();
  });
});
