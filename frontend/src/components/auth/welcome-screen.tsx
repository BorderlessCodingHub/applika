"use client";

import { useId } from "react";
import { LoaderCircle } from "lucide-react";

import { GithubIcon } from "@/components/brand-icons";
import { GITHUB_RESTORE_COPY } from "@/components/profile/github-restore-copy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const WELCOME_COPY = {
  title: "Used applika with GitHub before?",
  lead: "Bring back your old account, or start with an empty one. You only answer this once.",
  restoreTitle: "Bring back your old account",
  restoreBody:
    "Its applications, cycles, reports and CVs return, and it signs in with Borderless from now on.",
  restore: "Restore your data from GitHub",
  freshTitle: "Start with an empty account",
  freshBody:
    "You can still restore from your profile later, as long as this account holds no data.",
  startFresh: "Start fresh",
} as const;

export type WelcomePending = "restore" | "start-fresh" | null;

export interface WelcomeScreenProps {
  /** Starts the top-level GitHub navigation. */
  onRestore: () => void;
  /** Dismisses the prompt, then leaves for the return-to path or the dashboard. */
  onStartFresh: () => void;
  /** The choice in flight; both buttons lock until the browser leaves. */
  pending?: WelcomePending;
  className?: string;
}

/** The one-time choice a new Borderless account sees at `/welcome`. */
export function WelcomeScreen({
  onRestore,
  onStartFresh,
  pending = null,
  className,
}: WelcomeScreenProps) {
  const titleId = useId();
  const restoreBodyId = useId();
  const freshBodyId = useId();
  const locked = pending !== null;

  const spinner = (
    <LoaderCircle
      aria-hidden
      data-icon="inline-start"
      className="motion-safe:animate-spin"
    />
  );

  return (
    <section
      aria-labelledby={titleId}
      data-slot="welcome"
      data-pending={pending ?? undefined}
      className={cn(
        "mx-auto flex w-full max-w-2xl animate-fade-in-up flex-col gap-6 motion-reduce:animate-none md:pt-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1
          id={titleId}
          className="font-display text-2xl font-bold tracking-tight-display text-balance text-foreground sm:text-3xl"
        >
          {WELCOME_COPY.title}
        </h1>
        <p className="mt-2 text-sm text-pretty text-foreground/70">
          {WELCOME_COPY.lead}
        </p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-card">
        <div
          data-choice="restore"
          className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">
              {WELCOME_COPY.restoreTitle}
            </h2>
            <p
              id={restoreBodyId}
              className="text-sm text-pretty text-foreground/80"
            >
              {WELCOME_COPY.restoreBody}
            </p>
            <p className="text-xs text-pretty text-foreground/70">
              {GITHUB_RESTORE_COPY.privacy}
            </p>
          </div>
          <Button
            type="button"
            data-action="restore"
            aria-describedby={restoreBodyId}
            aria-disabled={locked || undefined}
            aria-busy={pending === "restore" || undefined}
            onClick={() => {
              if (!locked) onRestore();
            }}
            className="w-full aria-disabled:opacity-70 sm:w-auto sm:shrink-0"
          >
            {pending === "restore" ? (
              spinner
            ) : (
              <GithubIcon aria-hidden data-icon="inline-start" />
            )}
            {WELCOME_COPY.restore}
          </Button>
        </div>

        <div
          data-choice="start-fresh"
          className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">
              {WELCOME_COPY.freshTitle}
            </h2>
            <p
              id={freshBodyId}
              className="text-sm text-pretty text-foreground/80"
            >
              {WELCOME_COPY.freshBody}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            data-action="start-fresh"
            aria-describedby={freshBodyId}
            aria-disabled={locked || undefined}
            aria-busy={pending === "start-fresh" || undefined}
            onClick={() => {
              if (!locked) onStartFresh();
            }}
            className="w-full aria-disabled:opacity-70 sm:w-auto sm:shrink-0"
          >
            {pending === "start-fresh" ? spinner : null}
            {WELCOME_COPY.startFresh}
          </Button>
        </div>
      </div>
    </section>
  );
}
