"use client";

import { useId, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const CV_DIFF_CHANGED_LABEL = "Changed";
export const CV_DIFF_ORIGINAL_LABEL = "Original";
export const CV_DIFF_EMPTY_ORIGINAL = "Empty in the original CV.";
export const CV_DIFF_REVERT_LABEL = "Revert";
export const CV_DIFF_ADDED_KEYWORDS_LABEL = "Added keywords";
export const CV_DIFF_REMOVED_KEYWORDS_LABEL = "Removed keywords";

/** A scalar, a string list (bullets, keywords), or empty. */
export type CvDiffValue = string | readonly string[] | null | undefined;

const FIELD_CONTROL =
  'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), [role="combobox"]:not(:disabled)';

export interface CvChangedMarkerProps {
  /** Unique on the page: "Headline", "Role, experience 2". */
  fieldLabel: string;
  /** Display-ready baseline value (dates already `MM/yyyy`). */
  original: CvDiffValue;
  /** Set-like fields (skill keywords): what the copy added and dropped. */
  added?: readonly string[];
  removed?: readonly string[];
  /** Omit on a read-only copy: no Revert is rendered. */
  onRevert?: () => void;
  className?: string;
}

function isEmpty(value: CvDiffValue): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  return value.every((entry) => entry.trim() === "");
}

function KeywordChips({
  values,
  struck = false,
}: {
  values: readonly string[];
  struck?: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-1">
      {values.map((value, index) => (
        <li
          key={`${index}:${value}`}
          className={cn(badgeVariants({ variant: "outline" }), "bg-card")}
        >
          {struck ? (
            <del className="decoration-muted-foreground/70">{value}</del>
          ) : (
            value
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The "Changed" badge of a CV copy's field and its original-value popover.
 * Sits in a `CvField`-style `marker` slot, absolutely positioned at the end of
 * the label row of that `relative` wrapper (`CV_FIELD_MARKED_CLASS`).
 */
export function CvChangedMarker({
  fieldLabel,
  original,
  added,
  removed,
  onRevert,
  className,
}: CvChangedMarkerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const revertedRef = useRef(false);
  const eyebrowId = useId();
  const titleId = useId();
  const isSet = added !== undefined || removed !== undefined;

  const revert = () => {
    const field = triggerRef.current?.parentElement ?? null;
    revertedRef.current = true;
    onRevert?.();
    setOpen(false);
    // The marker unmounts once the value matches again; focus the field it described.
    requestAnimationFrame(() => {
      if (field?.isConnected)
        field.querySelector<HTMLElement>(FIELD_CONTROL)?.focus();
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) revertedRef.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          data-slot="cv-diff-changed"
          aria-label={`${CV_DIFF_CHANGED_LABEL}: ${fieldLabel}`}
          className={cn(
            badgeVariants({ variant: "outline" }),
            "absolute end-0 -top-[5px] h-6 cursor-pointer gap-1.5 px-2",
            "hover:bg-accent data-[state=open]:border-primary data-[state=open]:bg-primary/10",
            className,
          )}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {CV_DIFF_CHANGED_LABEL}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-labelledby={`${eyebrowId} ${titleId}`}
        onCloseAutoFocus={(event) => {
          if (revertedRef.current) event.preventDefault();
        }}
        className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3 p-3"
      >
        <div className="flex flex-col gap-1">
          <p
            id={eyebrowId}
            className="text-xs font-medium tracking-wide-label text-muted-foreground uppercase"
          >
            {CV_DIFF_ORIGINAL_LABEL}
          </p>
          <p id={titleId} className="text-sm leading-snug font-medium">
            {fieldLabel}
          </p>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-label={`${CV_DIFF_ORIGINAL_LABEL} value`}
          data-slot="cv-diff-original"
          className={cn(
            "max-h-60 overflow-y-auto rounded-md bg-muted/60 px-3 py-2 text-sm break-words whitespace-pre-wrap",
            "outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
        >
          {isEmpty(original) ? (
            <span className="text-muted-foreground italic">
              {CV_DIFF_EMPTY_ORIGINAL}
            </span>
          ) : typeof original === "string" ? (
            original
          ) : isSet ? (
            <KeywordChips values={original ?? []} />
          ) : (
            <ul className="flex list-disc flex-col gap-1 ps-4">
              {(original ?? []).map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ul>
          )}
        </div>

        {added?.length ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {CV_DIFF_ADDED_KEYWORDS_LABEL}
            </p>
            <KeywordChips values={added} />
          </div>
        ) : null}
        {removed?.length ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {CV_DIFF_REMOVED_KEYWORDS_LABEL}
            </p>
            <KeywordChips values={removed} struck />
          </div>
        ) : null}

        {onRevert ? (
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`${CV_DIFF_REVERT_LABEL} ${fieldLabel}`}
              onClick={revert}
            >
              <RotateCcw aria-hidden />
              {CV_DIFF_REVERT_LABEL}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
