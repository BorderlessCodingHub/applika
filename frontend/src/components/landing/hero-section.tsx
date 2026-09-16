"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { DashboardMockup } from "./dashboard-mockup";
import { SignInLink } from "../auth-buttons";

export function HeroSection() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh" />
      <div className="absolute inset-0 dot-grid opacity-40" />

      <div className="relative mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid items-center gap-12 md:grid-cols-[1fr_1.1fr] md:gap-8">
          <div className="text-center md:text-left">
            <div className="mb-6 inline-flex animate-fade-in-up items-center gap-2 rounded-full border border-border/60 bg-surface-elevated px-4 py-1.5 shadow-card">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="font-display text-[10px] font-medium tracking-wide-label text-muted-foreground uppercase">
                Job Application Tracker
              </span>
            </div>

            <h2 className="animate-fade-in-up font-display text-4xl leading-[1.08] font-extrabold tracking-tight-display text-balance text-foreground stagger-1 md:text-5xl lg:text-[3.5rem]">
              Manage your job search with{" "}
              <span className="text-primary">clarity</span>
            </h2>
            <p className="mx-auto mt-5 max-w-md animate-fade-in-up text-base leading-relaxed text-balance text-muted-foreground stagger-2 md:mx-0 md:text-lg">
              Track applications, monitor your pipeline, and turn your job
              search into a data-driven process with real-time analytics.
            </p>
            <div className="mt-8 flex animate-fade-in-up items-center justify-center gap-4 stagger-3 md:justify-start">
              {!isLoading && isAuthenticated ? (
                <Button
                  asChild
                  size="lg"
                  className="h-12 gap-2 px-8 font-display text-base font-semibold"
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
                  className="h-12 gap-2.5 px-8 font-display text-base font-semibold glow-primary"
                >
                  <SignInLink>Get started free</SignInLink>
                </Button>
              )}
            </div>
          </div>

          {/* Hide DashboardMockup on screens smaller than md */}
          <div className="hidden md:block">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
