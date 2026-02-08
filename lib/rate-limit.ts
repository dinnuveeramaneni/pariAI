type Bucket = {
  count: number;
  windowStart: number;
};

const WINDOW_MS = 60_000;
const buckets = new Map<string, Bucket>();

export function applyRateLimit(key: string): {
  ok: boolean;
  remaining: number;
} {
  const limit = Number(process.env.API_KEY_RATE_LIMIT_PER_MINUTE ?? 300);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0 };
  }

  bucket.count += 1;
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.count };
}

export function resetRateLimitForTests(): void {
  buckets.clear();
}
