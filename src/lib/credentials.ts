import 'server-only';
import type { Tx } from './db';
import { tx } from './db';
import { decrypt, encrypt } from './crypto';
import { config } from './config';
import { refresh, type TokenResponse } from './mighty/oauth';

export async function storeTokens(c: Tx, memberId: string, t: TokenResponse) {
  const key = config.tokenEncryptionKey;
  const expiresIn = Math.max(60, Math.min(t.expires_in ?? 3600, 86400));
  await c.query(
    `insert into oauth_credentials(member_id, access_token_enc, access_token_expires, refresh_token_enc, scopes, updated_at)
     values ($1, $2, now() + ($3 || ' seconds')::interval, $4, $5, now())
     on conflict (member_id) do update set
       access_token_enc = excluded.access_token_enc,
       access_token_expires = excluded.access_token_expires,
       refresh_token_enc = coalesce(excluded.refresh_token_enc, oauth_credentials.refresh_token_enc),
       scopes = excluded.scopes,
       updated_at = now()`,
    [
      memberId,
      encrypt(t.access_token, key),
      String(expiresIn - 30),
      t.refresh_token ? encrypt(t.refresh_token, key) : null,
      t.scope ?? config.mightyScopes,
    ],
  );
}

/**
 * Returns a valid access token for the member, refreshing if a refresh token
 * exists. Returns null when the member must reconnect (the network currently
 * advertises no refresh grant, so this happens after about an hour).
 */
export async function getAccessToken(memberId: string): Promise<string | null> {
  const row = await tx(null, async (c) => {
    const r = await c.query<{ access_token_enc: string; valid: boolean; refresh_token_enc: string | null }>(
      `select access_token_enc, access_token_expires > now() as valid, refresh_token_enc
         from oauth_credentials where member_id = $1`,
      [memberId],
    );
    return r.rows[0];
  });
  if (!row) return null;
  const key = config.tokenEncryptionKey;
  try {
    if (row.valid) return decrypt(row.access_token_enc, key);
  } catch {
    return null;
  }
  if (!row.refresh_token_enc) return null;
  try {
    const t = await refresh(decrypt(row.refresh_token_enc, key));
    await tx(null, (c) => storeTokens(c, memberId, t));
    return t.access_token;
  } catch {
    return null;
  }
}

export async function deleteTokens(memberId: string) {
  await tx(null, (c) => c.query('delete from oauth_credentials where member_id = $1', [memberId]));
}

export async function getStoredTokensForRevoke(memberId: string): Promise<string[]> {
  const row = await tx(null, async (c) =>
    (await c.query<{ access_token_enc: string; refresh_token_enc: string | null }>(
      'select access_token_enc, refresh_token_enc from oauth_credentials where member_id = $1',
      [memberId],
    )).rows[0],
  );
  if (!row) return [];
  const key = config.tokenEncryptionKey;
  const out: string[] = [];
  for (const enc of [row.refresh_token_enc, row.access_token_enc]) {
    if (!enc) continue;
    try {
      out.push(decrypt(enc, key));
    } catch {
      /* ignore */
    }
  }
  return out;
}
