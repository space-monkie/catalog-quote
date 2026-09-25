import { firebaseClient } from "./client";

/**
 * Asks the server to purge cached public pages of a store after an owner saves.
 * Best effort: failures are logged, never shown, because the data is already saved
 * and pages also revalidate on a timer.
 */
export async function requestRevalidate(storeId: string, previousSlug?: string): Promise<void> {
  try {
    const user = firebaseClient().auth.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch("/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ storeId, previousSlug }),
    });
  } catch (err) {
    console.warn("revalidate failed", err);
  }
}
