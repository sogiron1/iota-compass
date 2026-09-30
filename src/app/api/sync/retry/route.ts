import { json, withSession } from '@/lib/http';
import { syncNorthStar, syncSnapshot, type SyncState } from '@/lib/sync';

export const dynamic = 'force-dynamic';

const rank: Record<SyncState, number> = { complete: 0, not_configured: 1, partial: 2, needs_reconnect: 3 };

export const POST = withSession(
  async (_req, s) => {
    const a = await syncSnapshot(s.memberId, s.mightyMemberId);
    const b = await syncNorthStar(s.memberId, s.mightyMemberId);
    return json({ sync: rank[a] >= rank[b] ? a : b });
  },
  { write: true, route: 'sync_retry' },
);
