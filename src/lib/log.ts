// Structured logger that can only emit an event name plus an allow-listed set
// of safe fields. Answer text, tokens, codes and request bodies can never be
// passed through, because unknown keys are dropped.

const SAFE_KEYS = new Set([
  'memberId', // internal UUID, not the Mighty ID
  'recordType',
  'recordId',
  'fieldKey',
  'status',
  'attempt',
  'code',
  'httpStatus',
  'route',
  'count',
  'durationMs',
]);

type SafeFields = Record<string, string | number | boolean | null | undefined>;

function sanitize(fields: SafeFields = {}): SafeFields {
  const out: SafeFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!SAFE_KEYS.has(k)) continue;
    if (typeof v === 'string' && v.length > 80) continue; // never long strings
    out[k] = v;
  }
  return out;
}

export const log = {
  info(event: string, fields?: SafeFields) {
    console.info(JSON.stringify({ level: 'info', event, ...sanitize(fields) }));
  },
  warn(event: string, fields?: SafeFields) {
    console.warn(JSON.stringify({ level: 'warn', event, ...sanitize(fields) }));
  },
  error(event: string, fields?: SafeFields) {
    console.error(JSON.stringify({ level: 'error', event, ...sanitize(fields) }));
  },
};

export const __test = { sanitize };
