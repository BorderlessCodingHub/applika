"use client";

import { useRef } from "react";
import { CircleAlert, Info, LoaderCircle, RefreshCw, X } from "lucide-react";

import { JOB_SOURCES_COPY } from "@/components/admin/job-sources-copy";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The outcome of `POST /admin/jobs/runs` that stays on screen (R-035). */
export interface JobRunNotice {
  /** "info" for the 409 (a run is already going), "error" for the 503 and anything else. */
  tone: "info" | "error";
  /** The server's `detail`, verbatim. */
  message: string;
}

export interface JobSourcesHeaderProps {
  onRunNow: () => void;
  /** The POST is in flight. The label stays "Run now". */
  isStartingRun?: boolean;
  /** Shown under the header until the next "Run now" or a dismiss. */
  notice?: JobRunNotice | null;
  /** Renders a close button on the notice when given. */
  onDismissNotice?: () => void;
  className?: string;
}

/**
 * The page's h1, what the worker does, "Run now" and the run notice. The
 * notice's live region is always mounted so the 409/503 `detail` is announced;
 * clear the notice before each new POST, or the same words twice are not re-read.
 */
export function JobSourcesHeader({
  onRunNow,
  isStartingRun = false,
  notice = null,
  onDismissNotice,
  className,
}: JobSourcesHeaderProps) {
  const runNowRef = useRef<HTMLButtonElement>(null);

  return (
    <div data-slot="job-sources-header" className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold tracking-tight-display text-foreground">
            {JOB_SOURCES_COPY.title}
          </h1>
          <p className="mt-0.5 max-w-prose text-sm text-pretty text-muted-foreground">
            {JOB_SOURCES_COPY.description}
          </p>
        </div>
        {/* Pending keeps focus: aria-disabled, not disabled (KODI-048). */}
        <Button
          ref={runNowRef}
          type="button"
          size="sm"
          data-slot="job-run-now"
          aria-disabled={isStartingRun || undefined}
          aria-busy={isStartingRun || undefined}
          data-pending={isStartingRun ? "" : undefined}
          onClick={() => {
            if (!isStartingRun) onRunNow();
          }}
          className="shrink-0 self-start aria-disabled:opacity-60"
        >
          {isStartingRun ? (
            <LoaderCircle
              aria-hidden
              data-icon="inline-start"
              className="motion-safe:animate-spin"
            />
          ) : (
            <RefreshCw aria-hidden data-icon="inline-start" />
          )}
          {JOB_SOURCES_COPY.runNow}
        </Button>
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        data-slot="job-run-notice-region"
      >
        {notice ? (
          <JobRunNoticeBox
            notice={notice}
            onDismiss={
              onDismissNotice
                ? () => {
                    onDismissNotice();
                    runNowRef.current?.focus();
                  }
                : undefined
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function JobRunNoticeBox({
  notice,
  onDismiss,
}: {
  notice: JobRunNotice;
  onDismiss?: () => void;
}) {
  const isError = notice.tone === "error";
  const Icon = isError ? CircleAlert : Info;

  return (
    <div
      data-slot="job-run-notice"
      data-tone={notice.tone}
      className={cn(
        "mt-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm text-foreground",
        isError
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-primary/5",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          isError ? "text-destructive" : "text-primary",
        )}
      />
      <p
        data-slot="job-run-notice-message"
        className="min-w-0 flex-1 break-words"
      >
        {notice.message}
      </p>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={JOB_SOURCES_COPY.dismissNotice}
          onClick={onDismiss}
          className="-my-0.5 -mr-1 text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
