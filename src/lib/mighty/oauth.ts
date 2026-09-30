import 'server-only';
import { config } from '../config';

// Verified 2026-09-29 against https://the-new-human-university.mn.co/.well-known/oauth-authorization-server:
//   response_types: code; grant_types: authorization_code; PKCE: S256;
//   token auth: none | client_secret_post; scopes include read:userinfo, read:network, write:profile;
//   authorization response carries `iss` (RFC 9207). No refresh_token grant is advertised.

export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

export class OAuthError extends Error {
  constructor(public readonly safeCode: string, public readonly httpStatus?: number) {
    super(safeCode);
  }
}

function base() {
  return `https://${config.mightyNetworkHost}`;
}

export function issuer() {
  return base();
}

export function redirectUri() {
  return `${config.appBaseUrl}/api/auth/callback`;
}

export function authorizeUrl(state: string, codeChallenge: string): string {
  const u = new URL(`${base()}/oauth/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', config.mightyClientId);
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('scope', config.mightyScopes);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${base()}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': config.userAgent,
    },
    body: new URLSearchParams({
      ...body,
      client_id: config.mightyClientId,
      client_secret: config.mightyClientSecret, // client_secret_post
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    let code = `token_http_${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error && /^[a-z_]{1,40}$/.test(j.error)) code = j.error;
    } catch {
      /* ignore */
    }
    throw new OAuthError(code, res.status);
  }
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) throw new OAuthError('token_missing');
  return json;
}

export function exchangeCode(code: string, codeVerifier: string) {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: codeVerifier,
  });
}

export function refresh(refreshToken: string) {
  return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

// Docs list /oauth/revoke; discovery does not advertise it. Best effort.
export async function revoke(token: string): Promise<void> {
  try {
    await fetch(`${base()}/oauth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': config.userAgent },
      body: new URLSearchParams({
        token,
        client_id: config.mightyClientId,
        client_secret: config.mightyClientSecret,
      }),
      cache: 'no-store',
    });
  } catch {
    /* best effort */
  }
}
