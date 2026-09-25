import "server-only";

// Simple sliding-window limiter kept in process memory. Good enough for an MVP:
// each server instance enforces it independently. Swap for Firestore/Redis if needed.

type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export type RateLimitOptions = { limit: number; windowMs: number };

export const QUOTE_RATE_LIMIT: RateLimitOptions = { limit: 10, windowMs: 10 * 60 * 1000 };

export function checkRateLimit(key: string, options: RateLimitOptions, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  sweep(now, options.windowMs);
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < options.windowMs);
  if (bucket.timestamps.length >= options.limit) {
    buckets.set(key, bucket);
    const retryAfterMs = options.windowMs - (now - bucket.timestamps[0]);
    return { ok: false, retryAfterMs };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { ok: true, retryAfterMs: 0 };
}

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.timestamps.every((t) => now - t >= windowMs)) buckets.delete(key);
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
