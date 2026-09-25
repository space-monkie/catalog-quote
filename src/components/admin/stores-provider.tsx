"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { listenStores } from "@/lib/firebase/stores";
import type { Store } from "@/lib/schemas/types";
import { PageSpinner } from "@/components/ui/spinner";

type StoresContextValue = { stores: Store[]; loading: boolean; error: string | null };
const StoresContext = createContext<StoresContextValue>({ stores: [], loading: true, error: null });

export const LAST_STORE_KEY = "cq:admin:last-store";
const NO_STORES: Store[] = [];

/** Requires a signed-in user and keeps their store list live. */
export function StoresProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [result, setResult] = useState<{ uid: string; stores: Store[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    const uid = user.uid;
    return listenStores(
      uid,
      (list) => setResult({ uid, stores: list }),
      (e) => setError(e.message),
    );
  }, [user, authLoading, router]);

  const stores = user && result?.uid === user.uid ? result.stores : NO_STORES;
  const loading = authLoading || !user || (result?.uid !== user.uid && !error);
  const value = useMemo(() => ({ stores, loading, error }), [stores, loading, error]);

  if (authLoading || !user) return <PageSpinner />;
  return <StoresContext.Provider value={value}>{children}</StoresContext.Provider>;
}

export function useStores() {
  return useContext(StoresContext);
}

export function rememberStore(storeId: string) {
  try {
    localStorage.setItem(LAST_STORE_KEY, storeId);
  } catch {}
}

export function lastStoreId(): string | null {
  try {
    return localStorage.getItem(LAST_STORE_KEY);
  } catch {
    return null;
  }
}
