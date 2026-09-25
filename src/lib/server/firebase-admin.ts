import "server-only";
import { applicationDefault, cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

// Server-side Firebase Admin SDK. Credentials:
//  - Emulators: FIRESTORE_EMULATOR_HOST etc. are set, no credentials needed.
//  - Firebase App Hosting / Cloud Run: Application Default Credentials.
//  - Elsewhere: FIREBASE_SERVICE_ACCOUNT_JSON (a service account key as JSON).

declare global {
  var __cqAdminSettingsApplied: boolean | undefined;
}

export function adminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (usingEmulators) {
    // Skip the (slow, always failing) GCE metadata probe google-auth runs when no credential is set.
    process.env.METADATA_SERVER_DETECTION ??= "none";
    return initializeApp({ projectId, storageBucket });
  }
  if (serviceAccount) {
    return initializeApp({ credential: cert(JSON.parse(serviceAccount)), projectId, storageBucket });
  }
  return initializeApp({ credential: applicationDefault(), projectId, storageBucket });
}

export function adminDb(): Firestore {
  const db = getFirestore(adminApp());
  if (!globalThis.__cqAdminSettingsApplied) {
    db.settings({ ignoreUndefinedProperties: true });
    globalThis.__cqAdminSettingsApplied = true;
  }
  return db;
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}
