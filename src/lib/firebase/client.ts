import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

// Browser-side Firebase SDK. Used only by admin (dashboard/login) client components.

const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "true";

type Client = { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage };

declare global {
  // Survives hot reloads so we never connect the emulators twice.
  var __cqEmulatorsConnected: boolean | undefined;
}

let client: Client | null = null;

export function firebaseClient(): Client {
  if (client) return client;
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const storage = getStorage(app);

  if (USE_EMULATORS && !globalThis.__cqEmulatorsConnected) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    globalThis.__cqEmulatorsConnected = true;
  }

  client = { app, auth, db, storage };
  return client;
}
