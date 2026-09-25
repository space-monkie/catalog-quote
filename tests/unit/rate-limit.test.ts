import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/server/rate-limit";

describe("checkRateLimit", () => {
  it("allows up to the limit inside the window and blocks after", () => {
    const opts = { limit: 3, windowMs: 1000 };
    const key = `k-${Math.random()}`;
    expect(checkRateLimit(key, opts, 0).ok).toBe(true);
    expect(checkRateLimit(key, opts, 10).ok).toBe(true);
    expect(checkRateLimit(key, opts, 20).ok).toBe(true);
    const blocked = checkRateLimit(key, opts, 30);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(970);
    // Window slides: the first hit expires at t=1000.
    expect(checkRateLimit(key, opts, 1001).ok).toBe(true);
  });
});
