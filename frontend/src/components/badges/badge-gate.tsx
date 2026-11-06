"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { BadgeCheck, ExternalLink, Loader2 } from "lucide-react";
import { useLocale } from "next-intl";

import { ConfirmMembershipForm } from "@/components/badges/confirm-membership-form";
import { membershipAccess } from "@/components/badges/membership-badge";
import { buttonVariants } from "@/components/ui/button";
import { APP_CONFIG } from "@/config";
import { useAuth } from "@/contexts/auth-context";
import { liveCopy } from "@/i18n/translator";
import { cn } from "@/lib/utils";

export const BADGE_GATE_COPY = liveCopy("badges.gate", [
  "noBadgeTitle",
  "noBadgeWhy",
  "noBadgeRecent",
  "visitBorderless",
  "opensInNewTab",
  "unconfirmedNote",
  "loading",
]);

/** How long a confirmed gate waits for the reports' h1 before giving up on focus. */
const HEADING_WAIT_MS = 5_000;

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
  // Subscribes: the copy getters read the active language at call time.
  useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const previous = useRef(state);

  // A confirmed form unmounts its focused submit; land on the reports' h1,
  // never on a refetch. The reports usually show a skeleton first (their
  // queries only start once the badge is held), so wait for the h1 to appear
  // while focus is still lost, for up to HEADING_WAIT_MS.
  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (was !== "unconfirmed" || state !== "held") return;
    const root = rootRef.current;
    if (!root) return;

    const focusLost = () => {
      const active = document.activeElement;
      return !active || active === document.body;
    };
    const tryFocus = (): boolean => {
      if (!focusLost()) return true; // the user moved on: stop waiting
      const heading = root.querySelector<HTMLElement>("h1");
      if (!heading) return false;
      if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
      // Like the other headings focused from code: no focus ring on a heading.
      heading.classList.add("outline-none");
      heading.focus();
      return true;
    };
    if (tryFocus()) return;

    const observer = new MutationObserver(() => {
      if (tryFocus()) stop();
    });
    const timer = window.setTimeout(() => stop(), HEADING_WAIT_MS);
    function stop() {
      observer.disconnect();
      window.clearTimeout(timer);
    }
    observer.observe(root, { childList: true, subtree: true });
    return stop;
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
  useLocale();
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
