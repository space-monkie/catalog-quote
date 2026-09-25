import { describe, expect, it } from "vitest";
import { checkRateLimit, clientIpFromForwardedFor } from "@/lib/server/rate-limit";

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

describe("clientIpFromForwardedFor", () => {
  it("takes the entry the trusted proxy appended, not the client-supplied first entry", () => {
    // Google's load balancer appends "<client-ip>,<lb-ip>" to whatever the client sent.
    expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.7, 35.191.0.1")).toBe("203.0.113.7");
    expect(clientIpFromForwardedFor("203.0.113.7, 35.191.0.1")).toBe("203.0.113.7");
  });

  it("supports more trusted hops", () => {
    expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.7, 35.191.0.1, 10.0.0.1", 2)).toBe("203.0.113.7");
  });

  it("falls back to the only entry and handles empty input", () => {
    expect(clientIpFromForwardedFor("203.0.113.7")).toBe("203.0.113.7");
    expect(clientIpFromForwardedFor(" , ")).toBeNull();
    expect(clientIpFromForwardedFor(null)).toBeNull();
  });
});
