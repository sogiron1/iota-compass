import 'server-only';
import { tx } from './db';
import { log } from './log';
import { config } from './config';
import { getAccessToken } from './credentials';
import { writeOwnAnswer } from './mighty/operations';
import { MightyApiError } from './mighty/graphql';
import { QUESTION_KEYS, type FieldKey } from './content';

export type SyncState = 'complete' | 'partial' | 'needs_reconnect' | 'not_configured';

type Pending = { id: string; field_key: string; mighty_custom_field_id: string; text: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fieldMap(): Promise<Map<string, string>> {
  const r = await tx(null, (c) =>
    c.query<{ field_key: string; mighty_field_id: string }>('select field_key, mighty_field_id from mighty_field_map'),
  );
  return new Map(r.rows.map((x) => [x.field_key, x.mighty_field_id]));
}

async function writeWithRetry(token: string, p: Pending, mightyMemberId: string) {
  const delays = [0, 500, 1500];
  let last: MightyApiError | null = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i]) await sleep(delays[i] + Math.floor(Math.random() * 200));
    try {
      await writeOwnAnswer(token, { customFieldId: p.mighty_custom_field_id, memberId: mightyMemberId, text: p.text });
      return { ok: true as const, attempts: i + 1 };
    } catch (e) {
      last = e instanceof MightyApiError ? e : new MightyApiError('UNKNOWN', false);
      if (!last.transient) break;
    }
  }
  return { ok: false as const, attempts: delays.length, code: last?.safeCode ?? 'UNKNOWN' };
}

async function runPending(memberId: string, mightyMemberId: string, pending: Pending[]): Promise<SyncState> {
  if (pending.length === 0) return 'complete';
  const token = await getAccessToken(memberId);
  if (!token) {
    await tx(memberId, (c) =>
      c.query(
        `update sync_events set safe_error_code = 'NEEDS_RECONNECT', updated_at = now() where id = any($1::uuid[])`,
        [pending.map((p) => p.id)],
      ),
    );
    return 'needs_reconnect';
  }
  let failed = 0;
  // One mutation per field, sequentially (no documented batch mutation).
  for (const p of pending) {
    const started = Date.now();
    const res = await writeWithRetry(token, p, mightyMemberId);
    await tx(memberId, (c) =>
      c.query(
        `update sync_events set status = $2, attempt_count = attempt_count + $3,
                safe_error_code = $4, updated_at = now() where id = $1`,
        [p.id, res.ok ? 'succeeded' : 'failed', res.attempts, res.ok ? null : res.code],
      ),
    );
    log.info('sync.field', {
      memberId,
      fieldKey: p.field_key,
      status: res.ok ? 'succeeded' : 'failed',
      attempt: res.attempts,
      code: res.ok ? undefined : res.code,
      durationMs: Date.now() - started,
    });
    if (!res.ok) failed++;
    if (!res.ok && res.code === 'UNAUTHENTICATED') break;
  }
  if (failed > 0) {
    await alertAdmin('partial_sync', memberId);
    return 'partial';
  }
  return 'complete';
}

/** Creates (idempotently) and runs the 8 baseline field syncs. */
export async function syncSnapshot(memberId: string, mightyMemberId: string): Promise<SyncState> {
  const map = await fieldMap();
  if (!QUESTION_KEYS.every((k) => map.has(k))) return 'not_configured';
  const pending = await tx(memberId, async (c) => {
    const sub = await c.query<{ id: string }>(`select id from snapshot_submissions where checkpoint = 'baseline'`);
    const sid = sub.rows[0]?.id;
    if (!sid) return [];
    for (const k of QUESTION_KEYS) {
      await c.query(
        `insert into sync_events(member_id, record_type, record_id, field_key, mighty_custom_field_id)
         values ($1, 'snapshot', $2, $3, $4) on conflict (record_type, record_id, field_key) do nothing`,
        [memberId, sid, k, map.get(k)],
      );
    }
    const r = await c.query<Pending>(
      `select e.id, e.field_key, e.mighty_custom_field_id, a.answer as text
         from sync_events e
         join snapshot_answers a on a.submission_id = e.record_id and a.question_key = e.field_key
        where e.record_type = 'snapshot' and e.record_id = $1 and e.status <> 'succeeded'
        order by e.field_key`,
      [sid],
    );
    // Nothing to write for an intentionally blank optional answer.
    const blanks = r.rows.filter((p) => p.text.trim() === '');
    if (blanks.length) {
      await c.query(
        `update sync_events set status = 'succeeded', safe_error_code = 'BLANK_SKIPPED', updated_at = now()
          where id = any($1::uuid[])`,
        [blanks.map((b) => b.id)],
      );
    }
    return r.rows.filter((p) => p.text.trim() !== '');
  });
  return runPending(memberId, mightyMemberId, pending);
}

/** Syncs the member's ACTIVE North Star version only. */
export async function syncNorthStar(memberId: string, mightyMemberId: string): Promise<SyncState> {
  const map = await fieldMap();
  const fieldId = map.get('north_star' satisfies FieldKey);
  if (!fieldId) return 'not_configured';
  const pending = await tx(memberId, async (c) => {
    const ns = await c.query<{ id: string; statement: string }>(
      'select id, statement from north_stars where is_active',
    );
    const row = ns.rows[0];
    if (!row) return [];
    await c.query(
      `insert into sync_events(member_id, record_type, record_id, field_key, mighty_custom_field_id)
       values ($1, 'north_star', $2, 'north_star', $3) on conflict (record_type, record_id, field_key) do nothing`,
      [memberId, row.id, fieldId],
    );
    const r = await c.query<Pending>(
      `select e.id, e.field_key, e.mighty_custom_field_id, $2::text as text
         from sync_events e where e.record_type = 'north_star' and e.record_id = $1 and e.status <> 'succeeded'`,
      [row.id, row.statement],
    );
    return r.rows;
  });
  return runPending(memberId, mightyMemberId, pending);
}

export async function syncStatus(memberId: string) {
  return tx(memberId, async (c) => {
    const r = await c.query<{ record_type: string; total: string; done: string }>(
      `select e.record_type, count(*) as total, count(*) filter (where e.status = 'succeeded') as done
         from sync_events e
        where e.record_type = 'snapshot'
           or e.record_id = (select id from north_stars where is_active)
        group by e.record_type`,
    );
    const by = Object.fromEntries(r.rows.map((x) => [x.record_type, x.total === x.done]));
    return { snapshotSynced: by.snapshot ?? null, northStarSynced: by.north_star ?? null };
  });
}

// Admin alert: no answer text, no Mighty IDs — only that a sync needs attention.
async function alertAdmin(kind: string, memberId: string) {
  log.warn('sync.alert', { code: kind, memberId });
  const url = config.adminAlertWebhookUrl;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `IOTA Compass: a Mighty sync needs attention (${kind}). Check sync_events.` }),
    });
  } catch {
    /* best effort */
  }
}
