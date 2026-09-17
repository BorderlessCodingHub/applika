"use client";

import { useId, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CvSectionCard } from "@/components/base-cvs/cv-section-card";
import { cn } from "@/lib/utils";

/** Shown when the application carries no job description. */
export const JOB_DESCRIPTION_EMPTY_HINT =
  "No job description saved for this application. Add one when you edit the application and it will sit here, beside the CV copy, while you tailor it.";

export interface JobDescriptionPanelProps {
  /** The application's job description. `null`, `undefined` or blank all read as empty. */
  jobDescription?: string | null;
  /** Renders an "Add a job description" control in the empty state when given. */
  onAdd?: () => void;
  /** Hides the add control even when `onAdd` is given (read-only application). */
  disabled?: boolean;
  className?: string;
}

/**
 * The application's job description, read-only, beside the CV copy editor —
 * what the user is tailoring the copy TO.
 *
 * The body is its own bounded scroll area rather than a growing block: a job
 * description may be 50 000 characters, and an unbounded one would push the
 * live preview off the column entirely. It is focusable so a keyboard user can
 * scroll it, which WCAG 2.1.1 requires of any scrollable region.
 */
export function JobDescriptionPanel({
  jobDescription,
  onAdd,
  disabled = false,
  className,
}: JobDescriptionPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  const text = (jobDescription ?? "").trim();

  return (
    <CvSectionCard
      title="Job description"
      description="From the application. Read-only here."
      icon={ClipboardList}
      className={className}
      contentClassName={cn("p-0", !expanded && "hidden")}
      action={
        text ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Hide" : "Show"}
          </Button>
        ) : null
      }
    >
      {text ? (
        <div
          id={bodyId}
          tabIndex={0}
          role="region"
          aria-label="Job description text"
          className={cn(
            "max-h-72 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden",
          )}
        >
          {text}
        </div>
      ) : (
        <div id={bodyId} className="space-y-3 p-4">
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-pretty text-muted-foreground">
            {JOB_DESCRIPTION_EMPTY_HINT}
          </p>
          {onAdd && !disabled ? (
            <div className="flex justify-center">
              <Button type="button" size="sm" variant="outline" onClick={onAdd}>
                <Plus aria-hidden />
                Add a job description
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </CvSectionCard>
  );
}
