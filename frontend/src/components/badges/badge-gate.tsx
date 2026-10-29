"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { BadgeCheck, ExternalLink, Loader2 } from "lucide-react";

import { ConfirmMembershipForm } from "@/components/badges/confirm-membership-form";
import { membershipAccess } from "@/components/badges/membership-badge";
import { buttonVariants } from "@/components/ui/button";
import { APP_CONFIG } from "@/config";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";

export const BADGE_GATE_COPY = {
  noBadgeTitle: "Reports are for Borderless BASE and PSP members",
  noBadgeWhy:
    "Your Borderless account has no BASE or PSP membership on record. Biweekly reports are shared with your Borderless community, so they need one of those memberships.",
  noBadgeRecent:
    "Joined BASE or PSP recently? Sign out and sign in again to update your membership.",
  visitBorderless: "Visit Borderless",
  opensInNewTab: "Opens in a new tab.",
  unconfirmedNote: "Your reports open as soon as your membership is confirmed.",
  loading: "Loading",
} as const;

/** `membershipAccess(user).state`, or `loading` while the user loads. */
export type BadgeGateState = "loading" | "none" | "unconfirmed" | "held";

export interface BadgeGateViewProps {
  state: BadgeGateState;
  /** The wired confirm form, rendered with `titleAs="h1"`. */
  confirm: ReactNode;
  /**
   * Mounted only while `held`. Put the gate ABOVE the component that calls
   * the report hooks, so no report request goes out without a held badge.
   */
  children: ReactNode;
  /** Borderless home (`config.ts`); the no-badge state links to it when given. */
  borderlessHref?: string;
}

export function BadgeGateView({
  state,
  confirm,
  children,
  borderlessHref,
}: BadgeGateViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previous = useRef(state);

  // A confirmed form unmounts its focused submit; land on the reports' h1, never on a refetch.
  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (was !== "unconfirmed" || state !== "held") return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const heading = rootRef.current?.querySelector<HTMLElement>("h1");
    if (!heading) return;
    if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
    heading.focus();
  }, [state]);

  return (
    <div ref={rootRef} data-slot="badge-gate" data-state={state}>
      {state === "held" ? (
        children
      ) : state === "loading" ? (
        <div role="status" className="flex justify-center py-16 md:py-24">
          <Loader2 aria-hidden className="size-6 animate-spin text-primary" />
          <span className="sr-only">{BADGE_GATE_COPY.loading}</span>
        </div>
      ) : state === "unconfirmed" ? (
        <div className="mx-auto flex w-full max-w-2xl animate-fade-in-up flex-col gap-3 motion-reduce:animate-none">
          <div className="rounded-xl border border-warning/30 bg-card p-6 shadow-card sm:p-8">
            {confirm}
          </div>
          <p className="text-center text-xs text-foreground/70">
            {BADGE_GATE_COPY.unconfirmedNote}
          </p>
        </div>
      ) : (
        <NoBadgeExplanation borderlessHref={borderlessHref} />
      )}
    </div>
  );
}

function NoBadgeExplanation({ borderlessHref }: { borderlessHref?: string }) {
  const newTabId = useId();

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in-up motion-reduce:animate-none">
      <div className="flex flex-col rounded-xl bg-card p-6 shadow-card sm:p-8">
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-lg bg-primary-muted text-primary"
        >
          <BadgeCheck className="size-5" />
        </span>
        <h1 className="mt-4 font-display text-xl font-bold tracking-tight-display text-balance text-foreground sm:text-2xl">
          {BADGE_GATE_COPY.noBadgeTitle}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-pretty text-foreground/80">
          {BADGE_GATE_COPY.noBadgeWhy}
        </p>
        <p className="mt-3 max-w-prose text-sm text-pretty text-foreground/70">
          {BADGE_GATE_COPY.noBadgeRecent}
        </p>
        {borderlessHref ? (
          <>
            <a
              href={borderlessHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={newTabId}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-6 w-full sm:w-auto sm:self-start",
              )}
            >
              {BADGE_GATE_COPY.visitBorderless}
              <ExternalLink aria-hidden data-icon="inline-end" />
            </a>
            <span id={newTabId} className="sr-only">
              {BADGE_GATE_COPY.opensInNewTab}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The Reports gate (ADR-0024): the children only while the signed-in user's
 * BASE or PSP badge counts; the Borderless password form while a recorded
 * badge waits for confirmation; otherwise why Reports are closed. Sits above
 * the report hooks, which also stay off unless the badge is held.
 */
export function BadgeGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const state: BadgeGateState =
    isLoading || !user ? "loading" : membershipAccess(user).state;

  return (
    <BadgeGateView
      state={state}
      borderlessHref={APP_CONFIG.borderless.homeUrl}
      confirm={
        user ? (
          <ConfirmMembershipForm user={user} titleAs="h1" autoFocusPassword />
        ) : null
      }
    >
      {children}
    </BadgeGateView>
  );
}
