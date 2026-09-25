import "server-only";
import { adminAuth } from "./firebase-admin";

/** Verifies a Firebase ID token from `Authorization: Bearer <token>`; returns the uid or null. */
export async function uidFromRequest(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const decoded = await adminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    console.error("verifyIdToken failed:", (err as { code?: string })?.code ?? "unknown");
    return null;
  }
}
