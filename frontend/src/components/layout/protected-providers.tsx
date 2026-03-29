"use client";

import { AuthProvider } from "@/contexts/auth-context";
import type { ReactNode } from "react";

export function ProtectedProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
