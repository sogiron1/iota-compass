import { json, withSession } from '@/lib/http';
import { deleteTokens, getStoredTokensForRevoke } from '@/lib/credentials';
import { revoke } from '@/lib/mighty/oauth';
import { clearSessionCookie, revokeSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Signing out of Mighty does not sign members out of embedded apps, so this is
// the explicit "disconnect on a shared device" control.
export const POST = withSession(
  async (_req, s) => {
    for (const t of await getStoredTokensForRevoke(s.memberId)) await revoke(t);
    await deleteTokens(s.memberId);
    await revokeSession(s.sessionId);
    const res = json({ disconnected: true });
    clearSessionCookie(res);
    return res;
  },
  { write: true, route: 'disconnect' },
);
