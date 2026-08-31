type Bucket = { count: number; resetAt: number };

const globalBuckets = globalThis as unknown as { villaosRateLimits?: Map<string, Bucket> };
const buckets = globalBuckets.villaosRateLimits ?? new Map<string, Bucket>();
if (process.env.NODE_ENV !== "production") globalBuckets.villaosRateLimits = buckets;

export function rateLimit(key: string, options: { limit: number; windowMs: number }): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  current.count += 1;
  if (current.count <= options.limit) return { allowed: true, retryAfter: 0 };
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

export function requestIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "local";
}
