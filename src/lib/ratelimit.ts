// Small per-instance fixed-window limiter. Adequate for the MVP's scale
// (hundreds of members); swap for a shared store post-MVP.
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    }
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function clientKey(req: Request, suffix: string): string {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  return `${suffix}:${ip}`;
}
