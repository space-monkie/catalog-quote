import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  base64url,
  canonicalResource,
  grantedScopes,
  isAcceptableRedirectUri,
  isValidCodeChallenge,
  matchRedirectUri,
  parseScopes,
  randomToken,
  resourceMatches,
  sha256Hex,
  verifyPkceS256,
  withQuery,
} from "@/lib/oauth/utils";

const challengeFor = (verifier: string) => base64url(createHash("sha256").update(verifier).digest());

describe("PKCE S256", () => {
  // RFC 7636 appendix B example
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

  it("accepts the RFC 7636 example", () => {
    expect(challengeFor(verifier)).toBe(challenge);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("rejects a wrong or malformed verifier", () => {
    expect(verifyPkceS256(`${verifier}x`, challenge)).toBe(false);
    expect(verifyPkceS256("short", challenge)).toBe(false);
    expect(verifyPkceS256(undefined, challenge)).toBe(false);
  });

  it("validates challenge format", () => {
    expect(isValidCodeChallenge(challenge)).toBe(true);
    expect(isValidCodeChallenge("plain-text")).toBe(false);
    expect(isValidCodeChallenge(null)).toBe(false);
  });
});

describe("tokens", () => {
  it("are prefixed, unique and hash deterministically", () => {
    const a = randomToken("cq_at_");
    const b = randomToken("cq_at_");
    expect(a.startsWith("cq_at_")).toBe(true);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(45);
    expect(sha256Hex(a)).toBe(sha256Hex(a));
    expect(sha256Hex(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("scopes", () => {
  it("keeps known scopes and ignores the rest", () => {
    expect(parseScopes("catalog:read offline_access openid")).toEqual(["catalog:read"]);
  });

  it("defaults to every scope when none are known", () => {
    expect(parseScopes("")).toEqual(["catalog:read", "quotes:read", "catalog:write", "quotes:write"]);
    expect(parseScopes(undefined)).toHaveLength(4);
  });

  it("drops write scopes when the owner does not allow changes", () => {
    const all = parseScopes("");
    expect(grantedScopes(all, false)).toEqual(["catalog:read", "quotes:read"]);
    expect(grantedScopes(all, true)).toEqual(all);
  });
});

describe("resource indicators", () => {
  const expected = "https://catalog-quote--catalog-app-99.asia-southeast1.hosted.app/mcp";

  it("matches ignoring case of scheme/host and a trailing slash", () => {
    expect(resourceMatches(expected, expected)).toBe(true);
    expect(resourceMatches(`${expected}/`, expected)).toBe(true);
    expect(resourceMatches("HTTPS://CATALOG-QUOTE--catalog-app-99.asia-southeast1.hosted.app/mcp", expected)).toBe(true);
  });

  it("rejects other resources, fragments and garbage", () => {
    expect(resourceMatches("https://evil.example/mcp", expected)).toBe(false);
    expect(resourceMatches(`${expected}/other`, expected)).toBe(false);
    expect(resourceMatches(`${expected}#x`, expected)).toBe(false);
    expect(resourceMatches("not a url", expected)).toBe(false);
    expect(canonicalResource(undefined)).toBeNull();
  });
});

describe("redirect URIs", () => {
  it("accepts https and loopback http only", () => {
    expect(isAcceptableRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAcceptableRedirectUri("http://localhost/callback")).toBe(true);
    expect(isAcceptableRedirectUri("http://127.0.0.1:3118/callback")).toBe(true);
    expect(isAcceptableRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(false);
  });

  it("rejects plain http on the internet, fragments, credentials and dangerous schemes", () => {
    expect(isAcceptableRedirectUri("http://evil.example/cb")).toBe(false);
    expect(isAcceptableRedirectUri("https://claude.ai/cb#frag")).toBe(false);
    expect(isAcceptableRedirectUri("https://user:pw@claude.ai/cb")).toBe(false);
    expect(isAcceptableRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAcceptableRedirectUri("data:text/html,hi")).toBe(false);
  });

  it("matches exactly, except loopback http which ignores the port", () => {
    const claude = ["https://claude.ai/api/mcp/auth_callback"];
    expect(matchRedirectUri(claude, "https://claude.ai/api/mcp/auth_callback")).toBe("https://claude.ai/api/mcp/auth_callback");
    expect(matchRedirectUri(claude, "https://claude.ai/api/mcp/auth_callback/")).toBeNull();
    expect(matchRedirectUri(claude, "https://claude.ai:444/api/mcp/auth_callback")).toBeNull();

    const claudeCode = ["http://localhost/callback", "http://127.0.0.1/callback"];
    expect(matchRedirectUri(claudeCode, "http://localhost:3118/callback")).toBe("http://localhost:3118/callback");
    expect(matchRedirectUri(claudeCode, "http://127.0.0.1:51000/callback")).toBe("http://127.0.0.1:51000/callback");
    expect(matchRedirectUri(claudeCode, "http://localhost:3118/other")).toBeNull();
    expect(matchRedirectUri(["http://127.0.0.1/callback"], "http://localhost:3118/callback")).toBeNull();
    expect(matchRedirectUri(claudeCode, undefined)).toBeNull();
  });

  it("adds response parameters without dropping existing ones", () => {
    const url = withQuery("https://app.example/cb?x=1", { code: "abc", state: "s", iss: "https://issuer" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("x")).toBe("1");
    expect(parsed.searchParams.get("code")).toBe("abc");
    expect(parsed.searchParams.get("iss")).toBe("https://issuer");
  });
});

describe("hardening", () => {
  it("rejects every private-use scheme", async () => {
    const { isAcceptableRedirectUri: ok } = await import("@/lib/oauth/utils");
    expect(ok("ms-msdt:/id PCWDiagnostic")).toBe(false);
    expect(ok("search-ms:query=x")).toBe(false);
    expect(ok("myapp:/cb")).toBe(false);
    expect(ok("com.example.app:/oauth/cb")).toBe(false);
    expect(ok("vscode://vscode.github-authentication/did-authenticate")).toBe(false);
    expect(ok(`https://claude.ai/${"x".repeat(600)}`)).toBe(false);
  });

  it("maps only-unknown scopes to read-only", () => {
    expect(parseScopes("admin:all")).toEqual(["catalog:read", "quotes:read"]);
  });

  it("cleans app-supplied names", async () => {
    const { cleanDisplayName } = await import("@/lib/oauth/utils");
    expect(cleanDisplayName("  Cla‮ude\u0000  AI ")).toBe("Claude AI");
    expect(cleanDisplayName("x".repeat(100))).toHaveLength(60);
  });

  it("treats private, loopback and IPv4-mapped addresses as non-public", async () => {
    const { isPublicAddress } = await import("@/lib/oauth/safe-fetch");
    for (const ip of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "::1", "::", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "2002:7f00:1::1", "64:ff9b::a00:1"]) {
      expect(isPublicAddress(ip), ip).toBe(false);
    }
    for (const ip of ["8.8.8.8", "142.250.183.14", "2607:f8b0:4004:800::200e", "::ffff:8.8.8.8"]) {
      expect(isPublicAddress(ip), ip).toBe(true);
    }
  });

  it("keys IPv6 rate limits on the /64", async () => {
    const { ipRateKey } = await import("@/lib/server/rate-limit");
    expect(ipRateKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(ipRateKey("203.0.113.7")).toBe("203.0.113.7");
  });
});
