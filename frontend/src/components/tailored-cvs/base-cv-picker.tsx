"use client";

import { useEffect, useId } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { BaseCvList } from "@/components/base-cvs/base-cv-list";
import { BASE_CVS_MAX, type BaseCv } from "@/components/base-cvs/types";
import { Button } from "@/components/ui/button";
import { TailorByKeywordsSwitch } from "@/components/tailored-cvs/tailor-by-keywords-switch";
import { TailoredCvReadOnlyBanner } from "@/components/tailored-cvs/tailored-cv-read-only-banner";
import type { TailoredCvReadOnlyReason } from "@/components/tailored-cvs/types";
import { liveCopy } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/**
 * The picker's words in the active language (`cvs.tailored.picker`): `hint` is
 * said on screen so nobody goes looking for a default CV that does not exist;
 * `lockedBody` replaces the picker when the application no longer accepts a
 * copy. The component reads the same keys through `useTranslations`.
 */
export const BASE_CV_PICKER_COPY = liveCopy("cvs.tailored.picker", [
  "title",
  "hint",
  "lockedBody",
  "create",
]);

/**
 * The preselected master CV, if the choice makes itself: with exactly one there
 * is nothing to choose; with none or several, the user picks. Pure, so a page
 * can seed its own state with the same rule.
 */
export function preselectedBaseCvId(
  options: ReadonlyArray<Pick<BaseCv, "id">> | undefined,
): string | null {
  return options?.length === 1 ? options[0].id : null;
}

function baseCvEditorHref(cv: BaseCv): string {
  return `/cvs/editor?id=${cv.id}`;
}

export interface BaseCvPickerProps {
  /** The user's master CVs. `undefined` while unknown. */
  options: BaseCv[] | undefined;
  isLoading?: boolean;
  /** A load error message. Takes precedence over the empty state. */
  error?: string | null;
  /** Renders a retry control on the error state when given. */
  onRetry?: () => void;
  /** The selected master CV id. Controlled. An id not in `options` selects nothing. */
  value?: string | null;
  /** Fired with the chosen id, including the automatic single-option choice. */
  onValueChange: (baseCvId: string) => void;
  /** Fired when the user asks for the copy to be created. */
  onCreate: () => void;
  /** Reflects an in-flight create: spinner on the action, the list disabled. */
  isCreating?: boolean;
  /** Visible text and accessible name of the create action. Defaults to "Create the CV copy" in the active language. */
  createLabel?: string;
  /** "Tailor by keywords" (R-026). Off by default. */
  tailorByKeywords?: boolean;
  /** Renders the "Tailor by keywords" switch when given; pass it only when the application has a job description. */
  onTailorByKeywordsChange?: (checked: boolean) => void;
  /** Called once the user confirms a master CV's deletion. */
  onDelete: (cv: BaseCv) => void;
  /** Id of the master CV whose delete is in flight. */
  deletingId?: string | null;
  /** Asks the server for one master CV's PDF. */
  onExport: (cv: BaseCv) => void;
  /** Id of the master CV whose PDF render is in flight. */
  exportingId?: string | null;
  /** Asks the server for one master CV's Markdown (KODI-017 part 3), beside the PDF. */
  onExportMarkdown: (cv: BaseCv) => void;
  /** Id of the master CV whose Markdown render is in flight. */
  exportingMarkdownId?: string | null;
  /** Builds a master CV's editor link. */
  editHref?: (cv: BaseCv) => string;
  /** Destination of every "write a master CV" affordance. */
  newHref?: string;
  max?: number;
  /** Locks the whole surface: no list, no create. See `TailoredCvReadOnlyBanner`. */
  readOnlyReason?: TailoredCvReadOnlyReason | null;
  className?: string;
}

/**
 * Picks the master CV an application's CV copy is made from.
 *
 * It is the `/cvs` gallery (`BaseCvList`) with a radio on every tile: the same
 * tiles, keywords and edit, download and delete, the same create tile, and the
 * same loading, error and empty states. There is NO default master CV; the only
 * shortcut is that a lone master CV is preselected.
 *
 * Native radios, one per tile, not Radix `RadioGroup`: its roving-focus root is
 * itself a tab stop and would jump focus across the tiles' own buttons, and a
 * `radiogroup` may own only radios. The `fieldset` names the group and, while
 * the copy is being created, disables every control in it.
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
  createLabel,
  tailorByKeywords = false,
  onTailorByKeywordsChange,
  onDelete,
  deletingId,
  onExport,
  exportingId,
  onExportMarkdown,
  exportingMarkdownId,
  editHref = baseCvEditorHref,
  newHref = "/cvs/new",
  max = BASE_CVS_MAX,
  readOnlyReason,
  className,
}: BaseCvPickerProps) {
  const t = useTranslations("cvs.tailored.picker");
  const hintId = useId();
  const items = options ?? [];
  // A master CV deleted from this list must not stay selected, or the create
  // action would send an id the server no longer has.
  const selectedId =
    value && items.some((cv) => cv.id === value) ? value : null;
  const preselect = preselectedBaseCvId(options);

  // Reported through `onValueChange` so the page holds the one source of truth
  // for the selection, exactly as if the user had clicked it.
  useEffect(() => {
    if (readOnlyReason) return;
    if (preselect && !selectedId) onValueChange(preselect);
  }, [preselect, selectedId, onValueChange, readOnlyReason]);

  if (readOnlyReason) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        <TailoredCvReadOnlyBanner reason={readOnlyReason} />
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-pretty text-muted-foreground">
          {t("lockedBody")}
        </p>
      </div>
    );
  }

  const listProps = {
    cvs: options,
    isLoading,
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
    max,
  };

  // Loading, error and no master CV at all are the gallery's own states, word
  // for word: there is nothing to choose yet, so there is no group to name.
  if (isLoading || error || items.length === 0) {
    return <BaseCvList {...listProps} className={className} />;
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <fieldset disabled={isCreating} className="min-w-0">
        <legend className="mb-1">
          <h2 className="font-display text-base font-semibold">{t("title")}</h2>
        </legend>
        <p
          id={hintId}
          className="mb-4 text-sm text-pretty text-muted-foreground"
        >
          {t("hint")}
        </p>

        <BaseCvList
          {...listProps}
          selection={{
            value: selectedId,
            onValueChange,
            describedBy: hintId,
          }}
        />
      </fieldset>

      <div
        className={cn(
          "flex flex-wrap items-center border-t border-border pt-4",
          onTailorByKeywordsChange
            ? "gap-x-6 gap-y-4 sm:flex-nowrap"
            : "justify-end gap-2",
        )}
      >
        {onTailorByKeywordsChange ? (
          <TailorByKeywordsSwitch
            checked={tailorByKeywords}
            onCheckedChange={onTailorByKeywordsChange}
            disabled={isCreating}
            className="max-w-prose flex-1 basis-72"
          />
        ) : null}
        {/* Pending keeps focus: aria-disabled, not disabled (KODI-048). */}
        <Button
          type="button"
          onClick={() => {
            if (!isCreating) onCreate();
          }}
          disabled={!selectedId || deletingId === selectedId}
          aria-disabled={isCreating || undefined}
          aria-busy={isCreating || undefined}
          className="ml-auto shrink-0 aria-disabled:opacity-60"
        >
          {isCreating ? <Loader2 aria-hidden className="animate-spin" /> : null}
          {createLabel ?? t("create")}
        </Button>
      </div>
    </div>
  );
}
