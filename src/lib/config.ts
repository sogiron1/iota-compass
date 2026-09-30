import 'server-only';
import { hkdfSync } from 'node:crypto';

// All configuration comes from managed environment variables (names only in
// .env.example). Values never live in source control or logs.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

let cachedKey: Buffer | null = null;

export const config = {
  get appBaseUrl() {
    return required('APP_BASE_URL').replace(/\/$/, '');
  },
  get appOrigin() {
    return new URL(this.appBaseUrl).origin;
  },
  /** e.g. the-new-human-university.mn.co — hosts /oauth/* */
  get mightyNetworkHost() {
    return required('MIGHTY_NETWORK_HOST');
  },
  /** numeric network id used in the GraphQL path, e.g. 13510327 */
  get mightyNetworkId() {
    return required('MIGHTY_NETWORK_ID');
  },
  get mightyClientId() {
    return required('MIGHTY_OAUTH_CLIENT_ID');
  },
  get mightyClientSecret() {
    return required('MIGHTY_OAUTH_CLIENT_SECRET');
  },
  /** Fixed least-privilege scope set. Not configurable on purpose. */
  get mightyScopes() {
    return 'read:userinfo read:network write:profile';
  },
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  /**
   * 32-byte AES-256-GCM key for tokens at rest. Uses TOKEN_ENCRYPTION_KEY
   * (base64) when set; otherwise derives a key with HKDF-SHA256 from the OAuth
   * client secret. Rotating the secret only invalidates stored tokens, which
   * expire within about an hour anyway (no refresh grant on this network).
   */
  get tokenEncryptionKey(): Buffer {
    if (cachedKey) return cachedKey;
    const explicit = process.env.TOKEN_ENCRYPTION_KEY;
    if (explicit) {
      const k = Buffer.from(explicit, 'base64');
      if (k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)');
      cachedKey = k;
    } else {
      cachedKey = Buffer.from(
        hkdfSync('sha256', this.mightyClientSecret, 'iota-compass', 'token-encryption-v1', 32),
      );
    }
    return cachedKey;
  },
  get adminAlertWebhookUrl() {
    return process.env.ADMIN_ALERT_WEBHOOK_URL || null;
  },
  /** Mighty origins allowed to frame the app (CSP frame-ancestors). */
  get frameAncestors() {
    return (
      process.env.FRAME_ANCESTORS ||
      `https://${process.env.MIGHTY_NETWORK_HOST ?? ''} https://*.mn.co https://*.mightynetworks.com`
    ).trim();
  },
  get userAgent() {
    return 'IOTA-Compass/0.1 (+The New Human University)';
  },
  get mightyGraphqlUrl() {
    return `https://api.mn.co/networks/${encodeURIComponent(this.mightyNetworkId)}/graphql`;
  },
};
