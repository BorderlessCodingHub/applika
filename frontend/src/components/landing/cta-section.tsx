"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { AUTH_LOGIN_URL } from "@/services/types/auth";
import { Button } from "@/components/ui/button";
import { Github, ArrowRight } from "lucide-react";

export function CtaSection() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <section className="relative border-t border-border/60">
      <div className="gradient-mesh absolute inset-0 opacity-50" />
      <div className="relative mx-auto max-w-5xl px-4 py-16 text-center md:px-8 md:py-20">
        <h3 className="mb-4 font-display text-3xl font-extrabold tracking-tight-display text-foreground md:text-4xl">
          Ready to take control of your job search?
        </h3>
        <p className="mx-auto mb-8 max-w-lg text-base text-muted-foreground md:text-lg">
          Join hundreds of job seekers who track smarter, not harder. Free
          forever.
        </p>
        {!isLoading && isAuthenticated ? (
          <Button
            asChild
            size="lg"
            className="glow-primary h-12 gap-2 px-10 font-display text-base font-semibold"
          >
            <Link href="/dashboard">
              Go to Dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button
            asChild
            size="lg"
            className="glow-primary h-12 gap-2.5 px-10 font-display text-base font-semibold"
          >
            <a href={AUTH_LOGIN_URL}>
              <Github className="h-5 w-5" />
              Get started free
            </a>
          </Button>
        )}
      </div>
    </section>
  );
}
