import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, pkceChallenge, randomToken } from '../src/lib/crypto';
import { __test } from '../src/lib/log';
import { charCount, QUESTION_KEYS, QUESTIONS } from '../src/lib/content';

describe('crypto', () => {
  const key = Buffer.alloc(32, 7);
  it('round-trips and detects tampering', () => {
    const c = encrypt('refresh-token-value', key);
    expect(decrypt(c, key)).toBe('refresh-token-value');
    const parts = c.split('.');
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith('A') ? 'B' : 'A') + parts[3].slice(-1);
    expect(() => decrypt(parts.join('.'), key)).toThrow();
    expect(() => decrypt(c, Buffer.alloc(32, 8))).toThrow();
  });
  it('PKCE S256 matches RFC 7636 appendix B', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('random tokens are unique and url-safe', () => {
    const a = randomToken(), b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('log redaction', () => {
  it('drops unknown keys and long strings', () => {
    const out = __test.sanitize({ memberId: 'u1', answer: 'secret text', token: 'abc', code: 'x'.repeat(100), status: 'ok' } as never);
    expect(out).toEqual({ memberId: 'u1', status: 'ok' });
  });
});

describe('content', () => {
  it('counts emoji as one character', () => {
    expect(charCount('😀é—\n')).toBe(4);
  });
  it('has exactly eight questions in order', () => {
    expect(QUESTION_KEYS).toHaveLength(8);
    expect(QUESTIONS.q3.prompt).toBe('What isn’t?');
  });
});
