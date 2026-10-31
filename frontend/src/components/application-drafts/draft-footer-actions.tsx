"use client";

import { useId, type ReactNode } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
} from "lucide-react";

import {
  DRAFT_COPY,
  missingLabel,
  type DraftRequirement,
  type DraftStep,
} from "@/components/application-drafts/draft-copy";
import { Button, LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const APPLICATION_REQUIREMENTS: readonly DraftRequirement[] = [
  "company",
  "role",
  "platform",
];

const APPLICATIONS_HREF = "/applications";

export interface DraftFooterActionsProps {
  step: DraftStep;
  /** `<AutosaveStatus />`, rendered first. */
  status?: ReactNode;
  /** Step 1: false until the draft exists. */
  canContinue: boolean;
  onContinue: () => void;
  /** Step 2 back to step 1. */
  onBack: () => void;
  /**
   * Step 1 only (AC15/AC17): true while closing this tab would lose unsaved
   * work — the same condition the page's own `beforeunload` guard uses. The
   * Cancel link then forces a real top-level navigation
   * (`window.location.assign`) instead of the Next.js client-side transition,
   * so the browser's native beforeunload prompt fires; with nothing at risk
   * it is a plain link.
   */
  hasUnsavedRisk?: boolean;
  /** Everything that stops Finish; empty enables it. Step 1 shows only company, role, platform. */
  missing: readonly DraftRequirement[];
  onFinish: () => void;
  isFinishing?: boolean;
  /** The server's 422 `detail`, verbatim. */
  finishError?: string | null;
  className?: string;
}

/**
 * The right-hand side of the draft page's sticky footer: status, then
 * `Continue to CV` on step 1, or `Back` and `Finish` on step 2. Goes inside
 * `CvEditorFooter` on step 1 and before a copy exists, and into
 * `TailoredCvEditor`'s `footerEnd` once it does, so one footer is ever mounted.
 */
export function DraftFooterActions({
  step,
  status,
  canContinue,
  onContinue,
  onBack,
  hasUnsavedRisk = false,
  missing,
  onFinish,
  isFinishing = false,
  finishError,
  className,
}: DraftFooterActionsProps) {
  const hintId = useId();
  const applicationMissing = missing.filter((item) =>
    APPLICATION_REQUIREMENTS.includes(item),
  );
  const hint =
    step === "application"
      ? !canContinue && applicationMissing.length > 0
        ? missingLabel(applicationMissing)
        : null
      : missing.length > 0
        ? missingLabel(missing)
        : null;

  return (
    <div
      data-slot="draft-footer-actions"
      className={cn(
        "ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2",
        className,
      )}
    >
      {step === "cv" && finishError ? (
        <p
          role="alert"
          data-slot="draft-finish-error"
          className="flex basis-full items-start justify-end gap-1.5 text-sm text-pretty text-foreground"
        >
          <CircleAlertIcon
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-destructive"
          />
          <span>{finishError}</span>
        </p>
      ) : null}

      {status}

      {hint ? (
        <p
          id={hintId}
          data-slot="draft-missing"
          className="text-xs text-muted-foreground"
        >
          {hint}
        </p>
      ) : null}

      {step === "application" ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LinkButton
            href={APPLICATIONS_HREF}
            variant="outline"
            onClick={(event) => {
              if (!hasUnsavedRisk) return;
              event.preventDefault();
              window.location.assign(APPLICATIONS_HREF);
            }}
          >
            {DRAFT_COPY.cancel}
          </LinkButton>
          <Button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            aria-describedby={hint ? hintId : undefined}
          >
            {DRAFT_COPY.continueToCv}
            <ArrowRightIcon aria-hidden data-icon="inline-end" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeftIcon aria-hidden data-icon="inline-start" />
            {DRAFT_COPY.back}
          </Button>
          <Button
            type="button"
            onClick={onFinish}
            disabled={missing.length > 0 || isFinishing}
            aria-busy={isFinishing}
            aria-describedby={hint ? hintId : undefined}
          >
            {isFinishing ? (
              <LoaderCircleIcon
                aria-hidden
                data-icon="inline-start"
                className="motion-safe:animate-spin"
              />
            ) : null}
            {DRAFT_COPY.finish}
          </Button>
        </div>
      )}
    </div>
  );
}
