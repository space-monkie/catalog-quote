import type { ReactNode } from "react";
import { AuthProvider } from "@/components/admin/auth-provider";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
