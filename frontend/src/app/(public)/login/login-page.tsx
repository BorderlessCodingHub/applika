"use client";

import { AUTH_LOGIN_URL } from "@/services/types/auth";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { GithubIcon } from "@/components/brand-icons";

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
      <div className="gradient-mesh absolute inset-0" />
      <div className="dot-grid absolute inset-0 opacity-30" />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in-up">
        <div className="shadow-elevated rounded-2xl border border-border/60 bg-card p-10 text-center">
          <div className="mb-8">
            <div className="glow-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <span className="font-display text-xl font-bold text-primary-foreground">
                A
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight-display text-foreground">
              Applika
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Track your job applications effortlessly
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="glow-primary h-12 w-full gap-2.5 font-display text-base font-semibold"
          >
            <a href={AUTH_LOGIN_URL}>
              <GithubIcon className="h-5 w-5" />
              Login with GitHub
            </a>
          </Button>
          <p className="mt-5 text-[11px] text-muted-foreground/70">
            Secure authentication via GitHub OAuth
          </p>
        </div>
      </div>
    </div>
  );
}
