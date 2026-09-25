"use client";

import { createContext, useContext } from "react";
import type { Store } from "@/lib/schemas/types";

const StoreContext = createContext<Store | null>(null);

export const StoreProvider = StoreContext.Provider;

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside a store dashboard route");
  return store;
}
