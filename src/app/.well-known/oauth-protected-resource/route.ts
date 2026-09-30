import { protectedResourceMetadata } from "@/lib/oauth/metadata";
import { PUBLIC_CORS_HEADERS, preflight } from "@/lib/oauth/http";

// Root fallback location; clients try /.well-known/oauth-protected-resource/mcp first.
export function GET() {
  return Response.json(protectedResourceMetadata, { headers: { ...PUBLIC_CORS_HEADERS, "cache-control": "public, max-age=300" } });
}

export const OPTIONS = preflight;
