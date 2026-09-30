import "server-only";

// Small helpers shared by the OAuth and MCP route handlers.

export const PUBLIC_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id, mcp-method, mcp-name",
  "access-control-expose-headers": "www-authenticate, mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};

export function preflight(): Response {
  return new Response(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const merged = new Headers(response.headers);
  for (const [k, v] of Object.entries(headers)) merged.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { ...PUBLIC_CORS_HEADERS, "cache-control": "no-store", pragma: "no-cache", ...extra },
  });
}

export function oauthError(error: string, description: string, status = 400): Response {
  return jsonResponse({ error, error_description: description }, status);
}

/** Token and revocation endpoints take application/x-www-form-urlencoded (RFC 6749); accept JSON too. */
export async function readParams(request: Request): Promise<URLSearchParams> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) if (typeof v === "string") params.set(k, v);
    return params;
  }
  return new URLSearchParams(await request.text());
}
