import { authorizationServerMetadata } from "@/lib/oauth/metadata";
import { PUBLIC_CORS_HEADERS, preflight } from "@/lib/oauth/http";

export function GET() {
  return Response.json(authorizationServerMetadata, { headers: { ...PUBLIC_CORS_HEADERS, "cache-control": "public, max-age=300" } });
}

export const OPTIONS = preflight;
