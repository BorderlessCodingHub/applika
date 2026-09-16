"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { CookieConsent } from "@/components/cookie-consent";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { queryClient } from "@/lib/query-client";
import type { ReactNode } from "react";

/*
  next-themes only resolves a stored "system" value when `enableSystem` is set.
  Without it, a value saved by an earlier release would land on <html> as the
  literal class "system" — neither light nor dark. Normalising it here, at
  module scope, runs before ThemeProvider reads localStorage.
*/
if (typeof window !== "undefined") {
  try {
    if (window.localStorage.getItem("theme") === "system") {
      window.localStorage.setItem("theme", "dark");
    }
  } catch {
    // localStorage can be unavailable (private mode, blocked cookies).
  }
}

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="dark">
        <AuthProvider>
          <TooltipProvider>
            <Sonner richColors position="top-right" />
            {children}
            <CookieConsent />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
