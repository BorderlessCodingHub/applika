"use client";

import { useEffect, useId } from "react";
import { FileText, Loader2, RotateCcw, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TailoredCvReadOnlyBanner } from "@/components/tailored-cvs/tailored-cv-read-only-banner";
import { skillCategoryNames } from "@/components/base-cvs/types";
import type {
  BaseCvOption,
  TailoredCvReadOnlyReason,
} from "@/components/tailored-cvs/types";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_SKILLS = 5;

/** Copy for the zero-master-CV state. */
export const BASE_CV_PICKER_EMPTY_TITLE = "No master CV to copy from";
export const BASE_CV_PICKER_EMPTY_BODY =
  "This application stores its own copy of a master CV, edited for this job. Write a master CV first and it becomes selectable here.";
export const BASE_CV_PICKER_EMPTY_CTA = "Create a master CV";
/** Said on screen, so nobody goes looking for a default CV that does not exist. */
export const BASE_CV_PICKER_HINT =
  "Pick the master CV this application starts from. The copy is yours to edit for this job — the master CV never changes.";
/** Shown in place of the picker when the application no longer accepts a copy. */
export const BASE_CV_PICKER_LOCKED_BODY =
  "No CV copy was created for this application, and one can no longer be created.";

/**
 * The preselected option, if the choice makes itself.
 *
 * With exactly one master CV there is nothing to choose, so the picker selects
 * it for the user; with none or several, the user picks. Exported as a pure
 * function so a page can seed its own state with the same rule.
 */
export function preselectedBaseCvId(
  options: BaseCvOption[] | undefined,
): string | null {
  return options?.length === 1 ? options[0].id : null;
}

function formatUpdated(value: string | null): string | null {
  // `new Date(null)` is the epoch, not an invalid date, so a CV that has never
  // been updated would otherwise claim it was updated in 1970.
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export interface BaseCvPickerProps {
  /** The user's master CVs. `undefined` while unknown. */
  options: BaseCvOption[] | undefined;
  isLoading?: boolean;
  /** A load error message. Takes precedence over the empty state. */
  error?: string | null;
  /** Renders a retry control on the error state when given. */
  onRetry?: () => void;
  /** The selected master CV id. Controlled. */
  value?: string | null;
  /** Fired with the chosen id, including the automatic single-option choice. */
  onValueChange: (baseCvId: string) => void;
  /** Fired when the user asks for the copy to be created. */
  onCreate: () => void;
  /** Reflects an in-flight create: spinner on the action, controls disabled. */
  isCreating?: boolean;
  /** Visible text and accessible name of the create action. */
  createLabel?: string;
  /** Destination of every "write a master CV" affordance. */
  newCvHref?: string;
  /** Destination of the master CV gallery link. */
  cvsHref?: string;
  /** Locks the whole surface: no list, no create. See `TailoredCvReadOnlyBanner`. */
  readOnlyReason?: TailoredCvReadOnlyReason | null;
  className?: string;
}

/**
 * Picks the master CV an application's CV copy is made from.
 *
 * There is NO default master CV in this product: the choice is made per
 * application, every time, and the only shortcut is that a user with exactly one
 * master CV gets it preselected. With none, the surface becomes an invitation to
 * write one first.
 *
 * Native radios inside label cards, not a Select: there are at most three
 * options and the point is to compare them. Keyboard behaviour (arrow keys
 * within the group, one tab stop for the whole group) is the browser's, not
 * ours.
 */
export function BaseCvPicker({
  options,
  isLoading = false,
  error,
  onRetry,
  value,
  onValueChange,
  onCreate,
  isCreating = false,
  createLabel = "Create the CV copy",
  newCvHref = "/cvs/new",
  cvsHref = "/cvs",
  readOnlyReason,
  className,
}: BaseCvPickerProps) {
  const groupName = useId();
  const hintId = useId();
  const preselect = preselectedBaseCvId(options);

  // The lone option selects itself. Reported through `onValueChange` so the
  // page holds one source of truth for the selection, exactly as if the user
  // had clicked it.
  useEffect(() => {
    if (readOnlyReason) return;
    if (preselect && !value) onValueChange(preselect);
  }, [preselect, value, onValueChange, readOnlyReason]);

  if (readOnlyReason) {
    return (
      <div className={cn("space-y-4", className)}>
        <TailoredCvReadOnlyBanner reason={readOnlyReason} />
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-pretty text-muted-foreground">
          {BASE_CV_PICKER_LOCKED_BODY}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        aria-busy
        aria-label="Loading your master CVs"
        className={cn("grid gap-4 md:grid-cols-2", className)}
      >
        {Array.from({ length: 2 }).map((_, index) => (
          <Skeleton key={index} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-dashed border-destructive/50 bg-destructive/5 px-6 py-16 text-center",
          className,
        )}
      >
        <TriangleAlert aria-hidden className="mb-3 size-8 text-destructive" />
        <p className="text-sm font-medium">Could not load your master CVs</p>
        <p className="mt-1 max-w-sm text-xs text-pretty text-muted-foreground">
          {error}
        </p>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-4"
          >
            <RotateCcw aria-hidden />
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  const items = options ?? [];

  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-6 py-16 text-center",
          className,
        )}
      >
        <FileText
          aria-hidden
          className="mb-3 size-10 text-muted-foreground/40"
        />
        <h2 className="font-display text-base font-semibold">
          {BASE_CV_PICKER_EMPTY_TITLE}
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">
          {BASE_CV_PICKER_EMPTY_BODY}
        </p>
        <LinkButton href={newCvHref} className="mt-5">
          {BASE_CV_PICKER_EMPTY_CTA}
        </LinkButton>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <fieldset disabled={isCreating} className="min-w-0 space-y-3">
        <legend className="font-display text-base font-semibold">
          Choose a master CV
        </legend>
        <p id={hintId} className="text-sm text-pretty text-muted-foreground">
          {BASE_CV_PICKER_HINT}
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          {items.map((option) => {
            const checked = value === option.id;
            const categories = skillCategoryNames(option.skills ?? []);
            const visibleSkills = categories.slice(0, MAX_VISIBLE_SKILLS);
            const overflow = categories.length - visibleSkills.length;
            const updated = formatUpdated(option.updated_at);

            return (
              <label
                key={option.id}
                className={cn(
                  "group relative flex cursor-pointer flex-col rounded-xl border bg-card p-4 transition-colors",
                  "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                  checked
                    ? "border-primary ring-1 ring-primary/30"
                    : "border-border hover:border-primary/40",
                )}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={option.id}
                  checked={checked}
                  aria-describedby={hintId}
                  onChange={() => onValueChange(option.id)}
                  className="sr-only"
                />

                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-md",
                      checked
                        ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <FileText aria-hidden className="size-4" />
                  </span>
                  {updated ? (
                    <span className="text-right text-[11px] text-muted-foreground">
                      {`Updated ${updated}`}
                    </span>
                  ) : null}
                </div>

                <span className="mt-3 truncate font-display text-sm font-semibold">
                  {option.name}
                </span>
                <span className="mt-0.5 truncate text-xs text-muted-foreground">
                  {option.full_name}
                  {option.headline ? ` · ${option.headline}` : ""}
                </span>

                <span className="mt-3 flex min-h-6 flex-wrap gap-1">
                  {visibleSkills.map((skill) => (
                    <Badge
                      key={skill}
                      variant="secondary"
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    >
                      {skill}
                    </Badge>
                  ))}
                  {overflow > 0 ? (
                    <span className="self-center text-[10px] text-muted-foreground">
                      {`+${overflow}`}
                    </span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <LinkButton href={cvsHref} variant="ghost" size="sm">
          Manage master CVs
        </LinkButton>
        <Button
          type="button"
          onClick={onCreate}
          disabled={!value || isCreating}
          aria-busy={isCreating}
        >
          {isCreating ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {createLabel}
        </Button>
      </div>
    </div>
  );
}
