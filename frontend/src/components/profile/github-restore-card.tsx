"use client";

import { useId } from "react";
import { History, LoaderCircle } from "lucide-react";

import { GithubIcon } from "@/components/brand-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { GITHUB_RESTORE_COPY } from "./github-restore-copy";

export interface GithubRestoreCardProps {
  /** Starts the top-level GitHub navigation. Render the card only while `github_restore.available`. */
  onRestore: () => void;
  /** Keep it true until the browser leaves for GitHub (`isPending || isSuccess`). */
  pending?: boolean;
  className?: string;
}

export function GithubRestoreCard({
  onRestore,
  pending = false,
  className,
}: GithubRestoreCardProps) {
  const headingId = useId();
  const bodyId = useId();

  return (
    <section
      aria-labelledby={headingId}
      data-slot="github-restore-card"
      data-pending={pending || undefined}
      className={cn(
        "overflow-hidden rounded-xl bg-card shadow-card",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <History aria-hidden className="size-4 text-muted-foreground" />
        <h2 id={headingId} className="text-sm font-semibold text-foreground">
          {GITHUB_RESTORE_COPY.cardTitle}
        </h2>
      </div>

      <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80"
          >
            <GithubIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <p id={bodyId} className="text-sm text-pretty text-foreground">
              {GITHUB_RESTORE_COPY.cardBody}
            </p>
            <p className="text-xs text-pretty text-foreground/70">
              {GITHUB_RESTORE_COPY.privacy}
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-describedby={bodyId}
          aria-disabled={pending || undefined}
          aria-busy={pending || undefined}
          onClick={() => {
            if (!pending) onRestore();
          }}
          className="w-full aria-disabled:opacity-70 sm:w-auto sm:shrink-0"
        >
          {pending ? (
            <LoaderCircle
              aria-hidden
              data-icon="inline-start"
              className="motion-safe:animate-spin"
            />
          ) : (
            <GithubIcon aria-hidden data-icon="inline-start" />
          )}
          {GITHUB_RESTORE_COPY.cardAction}
        </Button>
      </div>
    </section>
  );
}
