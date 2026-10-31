"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** `itemClassName` of an added list row: a success change bar on its leading edge. */
export const CV_DIFF_ADDED_ROW_CLASS =
  "shadow-[inset_3px_0_0_var(--color-success)]";

/** Word hidden (still read) under a 20rem `cv-form` container, where the row caption needs the room. */
export function CvAddedBadge({ className }: { className?: string }) {
  const t = useTranslations("cvs.diff");
  return (
    <Badge
      variant="outline"
      data-slot="cv-diff-added"
      className={cn("shrink-0 gap-1", className)}
    >
      <Plus aria-hidden className="text-success" />
      <span className="sr-only @xs/cv-form:not-sr-only">{t("added")}</span>
    </Badge>
  );
}
