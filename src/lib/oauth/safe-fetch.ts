import "server-only";
import dns from "node:dns";
import https from "node:https";
import net from "node:net";

// Fetches a small JSON document from a public HTTPS URL (Client ID Metadata Documents).
// SSRF protections: https on port 443 with a DNS name (no IP literals), no redirects,
// every resolved address must be public (checked at connect time, so DNS rebinding can't
// swap in a private IP), a 5 s deadline for the whole request, a 5 KB body limit, and a
// cap on concurrent fetches per server instance.

const MAX_BYTES = 5 * 1024;
const DEADLINE_MS = 5000;
const MAX_IN_FLIGHT = 10;
let inFlight = 0;

// Separate lists: Node's BlockList also matches IPv4 addresses against IPv4-mapped IPv6
// rules, so mixing families in one list would block every IPv4 address.
const blockedV4 = new net.BlockList();
for (const [base, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(base, bits, "ipv4");
}
const blockedV6 = new net.BlockList();
for (const [base, bits] of [
  ["::", 96], // unspecified, loopback and IPv4-compatible
  ["64:ff9b::", 96], ["64:ff9b:1::", 48], // NAT64
  ["100::", 64], ["2001::", 23], ["2001:db8::", 32], ["2002::", 16], // discard, IETF, docs, 6to4
  ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(base, bits, "ipv6");
}

/** Extracts the embedded IPv4 address from an IPv4-mapped IPv6 address (any notation). */
function mappedIpv4(address: string): string | null {
  const probe = new net.BlockList();
  probe.addSubnet("::ffff:0:0", 96, "ipv6");
  if (!probe.check(address, "ipv6")) return null;
  const socketAddress = new net.SocketAddress({ address, family: "ipv6" });
  const groups = socketAddress.address.split(":");
  const last = groups.slice(-2);
  if (last.length === 2 && last.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) {
    const hi = parseInt(last[0], 16);
    const lo = parseInt(last[1], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  const dotted = socketAddress.address.match(/(\d+\.\d+\.\d+\.\d+)$/);
  return dotted ? dotted[1] : null;
}

export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "");
  if (net.isIPv4(ip)) return !blockedV4.check(ip, "ipv4");
  if (net.isIPv6(ip)) {
    const v4 = mappedIpv4(ip);
    if (v4) return !blockedV4.check(v4, "ipv4");
    return !blockedV6.check(ip, "ipv6");
  }
  return false;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

function publicOnlyLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, "");
    const list = addresses as dns.LookupAddress[];
    if (!list.length || !list.every((a) => isPublicAddress(a.address))) {
      return callback(Object.assign(new Error("Refusing to connect to a non-public address"), { code: "EBLOCKED" }), "");
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

export class SafeFetchError extends Error {}

export type SafeFetchResult = { status: number; body: string; cacheControl: string | null };

export function fetchPublicHttps(target: string): Promise<SafeFetchResult> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return Promise.reject(new SafeFetchError("Invalid URL"));
  }
  if (url.protocol !== "https:" || (url.port && url.port !== "443")) return Promise.reject(new SafeFetchError("Only https on port 443 is allowed"));
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, ""))) return Promise.reject(new SafeFetchError("IP addresses are not allowed"));
  if (inFlight >= MAX_IN_FLIGHT) return Promise.reject(new SafeFetchError("Too many concurrent fetches"));
  inFlight++;
  return new Promise<SafeFetchResult>((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: { accept: "application/json", "user-agent": "CatalogQuote-OAuth/1.0" },
        lookup: publicOnlyLookup as unknown as typeof dns.lookup,
      },
      (res) => {
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new SafeFetchError("Response too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            cacheControl: (res.headers["cache-control"] as string | undefined) ?? null,
          }),
        );
        res.on("error", reject);
      },
    );
    // Absolute deadline for DNS + connect + TLS + body (a socket idle timeout alone isn't enough).
    const deadline = setTimeout(() => req.destroy(new SafeFetchError("Timed out")), DEADLINE_MS);
    req.on("close", () => clearTimeout(deadline));
    req.on("error", reject);
    req.end();
  }).finally(() => {
    inFlight--;
  });
}
