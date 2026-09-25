"use client";

import { useCallback, useSyncExternalStore } from "react";

// Hydration-safe localStorage state built on useSyncExternalStore:
// the server (and the first client render) sees the fallback, then the real value.

type Listener = () => void;
const listeners = new Map<string, Set<Listener>>();
const cache = new Map<string, { raw: string | null; value: unknown }>();
let storageListenerAttached = false;

function attachStorageListener() {
  if (storageListenerAttached || typeof window === "undefined") return;
  storageListenerAttached = true;
  window.addEventListener("storage", (e) => {
    if (e.key === null) {
      cache.clear();
      listeners.forEach((set) => set.forEach((l) => l()));
    } else {
      cache.delete(e.key);
      notify(e.key);
    }
  });
}

function notify(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Parses the stored JSON, returning a stable reference while the raw string is unchanged. */
export function readStored<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;
  let value: T = fallback;
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function writeStored(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or quota: keep the in-memory value so the UI still works.
    cache.set(key, { raw: readRaw(key), value });
  }
  cache.delete(key);
  if (value !== null && value !== undefined) cache.set(key, { raw: readRaw(key), value });
  notify(key);
}

function subscribe(key: string) {
  return (listener: Listener) => {
    attachStorageListener();
    const set = listeners.get(key) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(key, set);
    return () => {
      set.delete(listener);
    };
  };
}

/**
 * React state persisted in localStorage. `fallback` must be a stable reference
 * (module-level constant) because it is also the server snapshot.
 */
export function useStoredValue<T>(key: string, fallback: T): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    useCallback((l: Listener) => subscribe(key)(l), [key]),
    () => readStored(key, fallback),
    () => fallback,
  );
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(readStored(key, fallback)) : next;
      writeStored(key, resolved);
    },
    [key, fallback],
  );
  return [value, set];
}

const noopSubscribe = () => () => {};

/** false during SSR and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
