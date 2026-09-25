"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseClient } from "@/lib/firebase/client";

type AuthContextValue = { user: User | null; loading: boolean };

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { auth } = firebaseClient();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const value = useMemo(() => ({ user, loading }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
