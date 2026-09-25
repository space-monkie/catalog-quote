import "server-only";

/**
 * Hook for Firebase App Check.
 *
 * To enable later:
 *  1. Register the web app for App Check (reCAPTCHA Enterprise) in the Firebase console.
 *  2. On the client, initialize App Check and send the token in the `X-Firebase-AppCheck` header.
 *  3. Replace the body below with `getAppCheck(adminApp()).verifyToken(token)`.
 */
export async function verifyAppCheck(request: Request): Promise<boolean> {
  void request.headers.get("x-firebase-appcheck");
  return true;
}
