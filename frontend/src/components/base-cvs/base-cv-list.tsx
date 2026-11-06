"use client";

import { useId } from "react";
import { FileText, RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CvCard } from "@/components/base-cvs/cv-card";
import { NewCvCard } from "@/components/base-cvs/new-cv-card";
import { BASE_CVS_MAX, type BaseCv } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

/** Makes the list a single-choice picker. See `BaseCvListProps.selection`. */
export interface BaseCvListSelection {
  /** The selected CV's id, or `null`. Controlled. */
  value: string | null;
  onValueChange: (id: string) => void;
  /** Id of the text that says what choosing does; describes every radio. */
  describedBy?: string;
}

export interface BaseCvListProps {
  /** The user's master CVs. `undefined` while unknown. */
  cvs: BaseCv[] | undefined;
  isLoading?: boolean;
  /** A load error message. Takes precedence over the empty state. */
  error?: string | null;
  /** Renders a retry control on the error state when given. */
  onRetry?: () => void;
  /** Builds the editor link for a CV. */
  editHref: (cv: BaseCv) => string;
  /** Destination of every create affordance. */
  newHref: string;
  onDelete: (cv: BaseCv) => void;
  /** Id of the CV whose delete is in flight. */
  deletingId?: string | null;
  /**
   * Asks the server for one CV's PDF. The page owns the request and the
   * errors. Optional ONLY so a surface with no export route can mount the
   * gallery; `/cvs` must pass it — the download is acceptance criterion 2.
   */
  onExport?: (cv: BaseCv) => void;
  /** Id of the CV whose PDF render is in flight. */
  exportingId?: string | null;
  /** Asks the server for one CV's Markdown (KODI-017 part 3), beside the PDF. */
  onExportMarkdown?: (cv: BaseCv) => void;
  /** Id of the CV whose Markdown render is in flight. */
  exportingMarkdownId?: string | null;
  max?: number;
  /** Overrides the on-screen reason on the disabled create tile. */
  limitReason?: string;
  /**
   * Gives every tile a radio in ONE group; the edit, download and delete stay.
   * Only the list state changes. The caller names the group (a `fieldset` and
   * `legend`) and owns the confirm action. Absent on `/cvs`.
   */
  selection?: BaseCvListSelection;
  className?: string;
}

/**
 * The `/cvs` gallery and all four of its states: loading, load error, no CVs
 * yet, and one to `max` CVs followed by the create tile. Presentation only —
 * the page owns the queries and the mutations.
 */
export function BaseCvList({
  cvs,
  isLoading = false,
  error,
  onRetry,
  editHref,
  newHref,
  onDelete,
  deletingId,
  onExport,
  exportingId,
  onExportMarkdown,
  exportingMarkdownId,
  max = BASE_CVS_MAX,
  limitReason,
  selection,
  className,
}: BaseCvListProps) {
  const groupName = useId();
  const t = useTranslations("cvs.list");

  if (isLoading) {
    return (
      <div
        aria-busy
        aria-label={t("loading")}
        className={cn("grid gap-4 md:grid-cols-2", className)}
      >
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-52 w-full rounded-xl" />
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
        <p className="text-sm font-medium">{t("errorTitle")}</p>
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
            {t("retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  const items = cvs ?? [];

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
          {t("emptyTitle")}
        </h2>
        <p className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">
          {t("emptyBody")}
        </p>
        <LinkButton href={newHref} className="mt-5">
          {t("emptyCta")}
        </LinkButton>
      </div>
    );
  }

  return (
    // `grid-cols-1` below `md`: the implicit `auto` column grows to a tile's
    // min-content, so a long CV name widened the page instead of truncating.
    <div className={cn("grid grid-cols-1 gap-4 md:grid-cols-2", className)}>
      {items.map((cv) => (
        <CvCard
          key={cv.id}
          cv={cv}
          href={editHref(cv)}
          onDelete={() => onDelete(cv)}
          isDeleting={deletingId === cv.id}
          onExport={onExport ? () => onExport(cv) : undefined}
          isExporting={exportingId === cv.id}
          onExportMarkdown={
            onExportMarkdown ? () => onExportMarkdown(cv) : undefined
          }
          isExportingMarkdown={exportingMarkdownId === cv.id}
          selection={
            selection
              ? {
                  name: groupName,
                  checked: selection.value === cv.id,
                  onSelect: () => selection.onValueChange(cv.id),
                  describedBy: selection.describedBy,
                }
              : undefined
          }
        />
      ))}
      <NewCvCard
        href={newHref}
        count={items.length}
        max={max}
        reason={limitReason}
      />
    </div>
  );
}
