import { revokeToken } from "@/lib/oauth/store";
import { jsonResponse, preflight, readParams } from "@/lib/oauth/http";

export const runtime = "nodejs";

// RFC 7009: always 200, whether or not the token existed.
export async function POST(request: Request) {
  const params = await readParams(request);
  try {
    await revokeToken(params.get("token"), params.get("client_id"));
  } catch (err) {
    console.error("[oauth/revoke]", (err as Error).message);
  }
  return jsonResponse({});
}

export const OPTIONS = preflight;
