import type { ReactNode } from "react";
import { StoresProvider } from "@/components/admin/stores-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <StoresProvider>{children}</StoresProvider>;
}
