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
import { signInPathFor } from "@/lib/session-ended";

/** The static export may serve a trailing slash. */
function isWelcomePath(pathname: string): boolean {
  return pathname.replace(/\/+$/, "") === "/welcome";
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, isLoading, user, logout, sessionEndedCode } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Before any early return (rules of hooks); held until the session is
  // confirmed so a signed-out visit never asks.
  const { features } = useMyFeatures(isAuthenticated);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      // `/device?code=` must survive the sign-in round trip.
      if (remembersReturnTo(window.location.pathname)) {
        storeReturnTo(window.location.pathname + window.location.search);
      }
      // AUTH-1049 (Borderless refused the grant) brings its words along;
      // any other signed-out visit lands on a plain `/login`.
      router.replace(signInPathFor(sessionEndedCode));
      return;
    }
    // A new Borderless account answers the one-time `/welcome` choice first;
    // the return-to path waits for it (the welcome page consumes it).
    if (user?.github_restore?.prompt) {
      if (!isWelcomePath(window.location.pathname)) router.replace("/welcome");
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
  }, [
    isAuthenticated,
    isLoading,
    router,
    sessionEndedCode,
    user?.github_restore?.prompt,
  ]);

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
            navItems={navItemsFor(user?.is_admin, features, {
              hasReportsBadge: (user?.badges?.length ?? 0) > 0,
            })}
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
