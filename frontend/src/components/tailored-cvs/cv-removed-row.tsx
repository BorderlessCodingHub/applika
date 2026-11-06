"use client";

import { useRef } from "react";
import { Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ROW_FOCUS_TARGET =
  '[data-slot="cv-item-trigger"], input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), [role="combobox"]:not(:disabled)';

export interface CvRemovedRowProps {
  /** The removed item's client id; Restore focuses the row that comes back with it. */
  itemId: string;
  /** Lowercase singular in the active language, as the section's rows use it: "experience". */
  itemNoun: string;
  /** The row caption the item had, with the section's own fallback ("New role"). */
  title: string;
  /** Secondary line, e.g. "Stripe · 03/2021 - present". */
  detail?: string;
  /** Omit on a read-only copy: no Restore is rendered. */
  onRestore?: () => void;
  className?: string;
}

/** A baseline list item the copy no longer has: greyed, not editable, restorable. Goes in a `CvRemovedRowSlot`. */
export function CvRemovedRow({
  itemId,
  itemNoun,
  title,
  detail,
  onRestore,
  className,
}: CvRemovedRowProps) {
  const t = useTranslations("cvs.diff");
  const rowRef = useRef<HTMLDivElement>(null);

  const restore = () => {
    const section = rowRef.current?.closest('[data-slot="cv-section"]') ?? null;
    onRestore?.();
    // This row unmounts; the restored one is found by the `data-item-id` the section stamps in diff mode.
    requestAnimationFrame(() => {
      if (!section?.isConnected) return;
      const row = Array.from(
        section.querySelectorAll<HTMLElement>("[data-item-id]"),
      ).find((element) => element.dataset.itemId === itemId);
      row?.querySelector<HTMLElement>(ROW_FOCUS_TARGET)?.focus();
    });
  };

  return (
    <div
      ref={rowRef}
      role="group"
      aria-label={t("removedGroup", { noun: itemNoun, title })}
      data-slot="cv-diff-removed"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-border-strong bg-muted/40 py-2.5 ps-4 pe-3",
        "shadow-[inset_3px_0_0_var(--color-destructive)]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
        <span className="text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
          {t("removed")}
        </span>
        <p className="truncate text-sm text-muted-foreground">
          <del className="decoration-muted-foreground/70">{title}</del>
          {detail ? <span> · {detail}</span> : null}
        </p>
      </div>
      {onRestore ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t("restoreLabel", { noun: itemNoun, title })}
          onClick={restore}
          className="shrink-0"
        >
          <Undo2 aria-hidden />
          {t("restore")}
        </Button>
      ) : null}
    </div>
  );
}
