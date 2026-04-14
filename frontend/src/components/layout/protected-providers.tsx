"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { AgendaNotificationsProvider } from "@/contexts/agenda-notifications-context";
import type { ReactNode } from "react";

export function ProtectedProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AgendaNotificationsProvider>{children}</AgendaNotificationsProvider>
    </AuthProvider>
  );
}
