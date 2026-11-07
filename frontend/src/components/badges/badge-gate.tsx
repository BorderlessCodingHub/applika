"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { BadgeAlert, BadgeCheck, ExternalLink, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { membershipAccess } from "@/components/badges/membership-badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
  "reconnectTitle",
  "signInAgain",
  "loading",
]);

/** `membershipAccess(user).state`, or `loading` while the user loads. */
export type BadgeGateState = "loading" | "none" | "needs_reconnect" | "held";

export interface BadgeGateViewProps {
  state: BadgeGateState;
  /** `needs_reconnect`'s "Sign in again": end this session, then `/login`. */
  onSignInAgain: () => void;
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
  onSignInAgain,
  children,
  borderlessHref,
}: BadgeGateViewProps) {
  // Subscribes: the copy getters read the active language at call time.
  useLocale();

  return (
    <div data-slot="badge-gate" data-state={state}>
      {state === "held" ? (
        children
      ) : state === "loading" ? (
        <div role="status" className="flex justify-center py-16 md:py-24">
          <Loader2 aria-hidden className="size-6 animate-spin text-primary" />
          <span className="sr-only">{BADGE_GATE_COPY.loading}</span>
        </div>
      ) : state === "needs_reconnect" ? (
        <ReconnectExplanation onSignInAgain={onSignInAgain} />
      ) : (
        <NoBadgeExplanation borderlessHref={borderlessHref} />
      )}
    </div>
  );
}

/**
 * A recorded badge while Borderless refuses applika's grant (ADR-0026): the
 * API's AUTH-1050 words and "Sign in again". Never a password form.
 */
function ReconnectExplanation({
  onSignInAgain,
}: {
  onSignInAgain: () => void;
}) {
  useLocale();
  const tErrors = useTranslations("errors");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyId = useId();

  // Reached mid-page (a report request answered 403 AUTH-1050), the reports
  // unmount with focus inside them: land on this h1 instead of `body`.
  useEffect(() => {
    const active = document.activeElement;
    if (!active || active === document.body) headingRef.current?.focus();
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in-up motion-reduce:animate-none">
      <div
        data-slot="badge-gate-reconnect"
        className="flex flex-col rounded-xl border border-warning/30 bg-card p-6 shadow-card sm:p-8"
      >
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-lg bg-warning/10 text-warning"
        >
          <BadgeAlert className="size-5" />
        </span>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="mt-4 font-display text-xl font-bold tracking-tight-display text-balance text-foreground outline-none sm:text-2xl"
        >
          {BADGE_GATE_COPY.reconnectTitle}
        </h1>
        <p
          id={bodyId}
          className="mt-2 max-w-prose text-sm text-pretty text-foreground/80"
        >
          {tErrors("AUTH-1050")}
        </p>
        <Button
          type="button"
          data-action="badge-gate-sign-in-again"
          aria-describedby={bodyId}
          onClick={onSignInAgain}
          className="mt-6 w-full sm:w-auto sm:self-start"
        >
          {BADGE_GATE_COPY.signInAgain}
        </Button>
      </div>
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
 * The Reports gate (ADR-0024, ADR-0026): the children only while the
 * signed-in user's BASE or PSP badge counts; while a recorded badge waits
 * for a new sign-in (Borderless refused applika's grant, or a report request
 * answered 403 AUTH-1050, see `hooks/use-repports.ts`), its words and "Sign
 * in again"; otherwise why Reports are closed. Sits above the report hooks,
 * which also stay off unless the badge is held.
 */
export function BadgeGate({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const state: BadgeGateState =
    isLoading || !user ? "loading" : membershipAccess(user).state;

  return (
    <BadgeGateView
      state={state}
      borderlessHref={APP_CONFIG.borderless.homeUrl}
      onSignInAgain={() => {
        void logout("/login");
      }}
    >
      {children}
    </BadgeGateView>
  );
}
