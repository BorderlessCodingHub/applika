"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { CycleProvider } from "@/contexts/cycle-context";
import { SupportsProvider } from "@/contexts/supports-context";
import { AppShell } from "@/components/layout/app-shell";
import { navItemsFor } from "@/components/layout/nav";
import { useMyFeatures } from "@/hooks/use-features";
import { Loader2 } from "lucide-react";
import { ProtectedProviders } from "@/components/layout/protected-providers";
import {
  consumeReturnTo,
  remembersReturnTo,
  storeReturnTo,
} from "@/lib/return-to";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Before any early return (rules of hooks); held until the session is
  // confirmed so a signed-out visit never asks.
  const { features } = useMyFeatures(isAuthenticated);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      // `/device?code=` must survive the sign-in round trip (KODI-058).
      if (remembersReturnTo(window.location.pathname)) {
        storeReturnTo(window.location.pathname + window.location.search);
      }
      router.replace("/login");
      return;
    }
    // Consumed once: removed from storage before navigating.
    const target = consumeReturnTo();
    if (
      target &&
      target !== window.location.pathname + window.location.search
    ) {
      router.replace(target);
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-viewport items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <ProtectedProviders>
      <SupportsProvider>
        <CycleProvider>
          <AppShell
            activePath={pathname}
            navItems={navItemsFor(user?.is_admin, features)}
            user={user}
            onLogout={() => {
              void logout();
            }}
          >
            {children}
          </AppShell>
        </CycleProvider>
      </SupportsProvider>
    </ProtectedProviders>
  );
}
