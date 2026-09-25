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

/**
 * Number of proxies in front of the app that append to X-Forwarded-For.
 * Google's load balancer (used by App Hosting) appends "<client-ip>,<lb-ip>",
 * so the client is 1 hop from the right. Entries further left are sent by the
 * client and cannot be trusted. Override with TRUSTED_PROXY_HOPS if needed.
 */
export const DEFAULT_TRUSTED_PROXY_HOPS = 1;

/** Picks the client IP from an X-Forwarded-For value, counting trusted hops from the right. */
export function clientIpFromForwardedFor(header: string | null, trustedHops = DEFAULT_TRUSTED_PROXY_HOPS): string | null {
  if (!header) return null;
  const parts = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const index = parts.length - 1 - Math.max(0, trustedHops);
  return parts[Math.max(0, index)];
}

let loggedHopCount = false;

export function clientIp(request: Request): string {
  const header = request.headers.get("x-forwarded-for");
  if (header && !loggedHopCount) {
    // One line per server instance, no addresses: confirms how many hops the platform adds.
    loggedHopCount = true;
    console.info(`[rate-limit] x-forwarded-for has ${header.split(",").length} entries on this instance's first request`);
  }
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? DEFAULT_TRUSTED_PROXY_HOPS);
  return clientIpFromForwardedFor(header, Number.isFinite(hops) ? hops : DEFAULT_TRUSTED_PROXY_HOPS) ?? request.headers.get("x-real-ip") ?? "unknown";
}
