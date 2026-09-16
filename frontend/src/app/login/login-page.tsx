"use client";

import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignInLink } from "@/components/auth-buttons";
import { ApplikaIcon } from "@/components/app-logo";

export function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, router]);

  if (!isLoading && isAuthenticated) {
    return null;
  }

  return (
    <div className="noise-overlay relative flex min-h-screen items-center justify-center bg-background p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 gradient-mesh" />
      <div className="absolute inset-0 dot-grid opacity-30" />

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="rounded-2xl border border-border/60 bg-surface-elevated p-10 text-center shadow-elevated">
          <div className="mb-8">
            <h1 className="flex items-center justify-center font-display text-2xl font-bold tracking-tight-display text-foreground">
              <ApplikaIcon className="size-10 text-primary" />
              pplika.dev
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Track your job applications effortlessly
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="h-12 w-full gap-2.5 font-display text-base font-semibold glow-primary"
          >
            <SignInLink>Login with GitHub</SignInLink>
          </Button>
          <p className="mt-5 text-[11px] text-muted-foreground/80">
            Secure authentication via GitHub OAuth
          </p>
        </div>
      </div>
    </div>
  );
}
