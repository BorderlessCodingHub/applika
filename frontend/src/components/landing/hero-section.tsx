"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { AUTH_LOGIN_URL } from "@/services/types/auth";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { DashboardMockup } from "./dashboard-mockup";
import { GithubIcon } from "../brand-icons";

const STAR_PATH =
  "M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z";

export function HeroSection() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <section className="relative overflow-hidden">
      <div className="gradient-mesh absolute inset-0" />
      <div className="dot-grid absolute inset-0 opacity-40" />

      <div className="relative mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid items-center gap-12 md:grid-cols-[1fr,1.1fr] md:gap-8">
          <div className="text-center md:text-left">
            <div className="mb-6 inline-flex animate-fade-in-up items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 shadow-card">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              <span className="font-display text-[10px] font-medium uppercase tracking-wide-label text-muted-foreground">
                Job Application Tracker
              </span>
            </div>

            <h2 className="stagger-1 animate-fade-in-up text-balance font-display text-4xl font-extrabold leading-[1.08] tracking-tight-display text-foreground md:text-5xl lg:text-[3.5rem]">
              Manage your job search with{" "}
              <span className="text-primary">clarity</span>
            </h2>
            <p className="stagger-2 mx-auto mt-5 max-w-md animate-fade-in-up text-balance text-base leading-relaxed text-muted-foreground md:mx-0 md:text-lg">
              Track applications, monitor your pipeline, and turn your job
              search into a data-driven process with real-time analytics.
            </p>
            <div className="stagger-3 mt-8 flex animate-fade-in-up items-center justify-center gap-4 md:justify-start">
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
                  className="glow-primary h-12 gap-2.5 px-8 font-display text-base font-semibold"
                >
                  <a href={AUTH_LOGIN_URL}>
                    <GithubIcon className="h-5 w-5" />
                    Get started free
                  </a>
                </Button>
              )}
            </div>

            {/* Trust metrics */}
            <div className="stagger-4 mt-8 flex animate-fade-in-up items-center justify-center gap-6 md:justify-start">
              <div className="flex items-center gap-1.5">
                <div className="flex -space-x-1">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="h-5 w-5 rounded-full border-2 border-card bg-muted"
                      style={{
                        backgroundColor: `hsl(${168 + i * 30}, 40%, ${60 + i * 8}%)`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Active users
                </span>
              </div>
              <div className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1">
                <span className="font-display text-[11px] font-semibold text-foreground">
                  4.9
                </span>
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="h-2.5 w-2.5 fill-current text-warning"
                      viewBox="0 0 20 20"
                    >
                      <path d={STAR_PATH} />
                    </svg>
                  ))}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  rating
                </span>
              </div>
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
