import 'server-only';
import { Pool, type PoolClient } from 'pg';
import { config } from './config';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 3,
      idleTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: true },
    });
  }
  return pool;
}

export type Tx = PoolClient;

/**
 * Runs `fn` in a transaction as the least-privilege `compass_app` role.
 * When memberId is given, RLS limits every member-owned table to that member.
 * memberId MUST come from the verified server-side session, never from input.
 */
export async function tx<T>(memberId: string | null, fn: (c: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('set local role compass_app');
    if (memberId) await client.query("select set_config('app.member_id', $1, true)", [memberId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
