import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseClient } from "./client";
import { t } from "@/lib/i18n/en";

/** Creates users/{uid} on first sign-in (idempotent). */
export async function ensureUserProfile(user: User): Promise<void> {
  const { db } = firebaseClient();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    email: user.email ?? "",
    name: user.displayName ?? "",
    createdAt: serverTimestamp(),
  });
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { auth } = firebaseClient();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<User> {
  const { auth } = firebaseClient();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function signInWithGoogle(): Promise<User> {
  const { auth } = firebaseClient();
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function signOut(): Promise<void> {
  const { auth } = firebaseClient();
  await firebaseSignOut(auth);
}

/** Maps Firebase Auth error codes to user-facing text. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return t.auth.errors.invalid;
    case "auth/email-already-in-use":
      return t.auth.errors.emailInUse;
    case "auth/weak-password":
      return t.auth.errors.weakPassword;
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return t.auth.errors.popupClosed;
    default:
      return t.auth.errors.generic;
  }
}
