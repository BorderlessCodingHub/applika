"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle } from "lucide-react";

import { GithubIcon } from "@/components/brand-icons";
import { GITHUB_RESTORE_COPY } from "@/components/profile/github-restore-copy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const t = useTranslations("welcome");
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
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-pretty text-foreground/70">
          {t("lead")}
        </p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-card">
        <div
          data-choice="restore"
          className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("restoreTitle")}
            </h2>
            <p
              id={restoreBodyId}
              className="text-sm text-pretty text-foreground/80"
            >
              {t("restoreBody")}
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
            className="h-auto min-h-9 w-full whitespace-normal aria-disabled:opacity-70 sm:h-9 sm:w-auto sm:shrink-0 sm:whitespace-nowrap"
          >
            {pending === "restore" ? (
              spinner
            ) : (
              <GithubIcon aria-hidden data-icon="inline-start" />
            )}
            {t("restore")}
          </Button>
        </div>

        <div
          data-choice="start-fresh"
          className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("freshTitle")}
            </h2>
            <p
              id={freshBodyId}
              className="text-sm text-pretty text-foreground/80"
            >
              {t("freshBody")}
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
            className="h-auto min-h-9 w-full whitespace-normal aria-disabled:opacity-70 sm:h-9 sm:w-auto sm:shrink-0 sm:whitespace-nowrap"
          >
            {pending === "start-fresh" ? spinner : null}
            {t("startFresh")}
          </Button>
        </div>
      </div>
    </section>
  );
}
