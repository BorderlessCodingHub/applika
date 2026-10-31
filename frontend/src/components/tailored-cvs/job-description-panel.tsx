"use client";

import { ClipboardList, Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CvSectionCard } from "@/components/base-cvs/cv-section-card";
import { cn } from "@/lib/utils";

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
 *
 * Hiding the text is `CvSectionCard`'s own disclosure and nothing else. This
 * panel used to carry a second one — a Hide/Show button in the header's action
 * slot — which once the card itself became collapsible left the same body
 * behind TWO independent toggles that could disagree. The card's header is now
 * the single control, and the action slot is gone with it (KODI-009).
 */
export function JobDescriptionPanel({
  jobDescription,
  onAdd,
  disabled = false,
  className,
}: JobDescriptionPanelProps) {
  const t = useTranslations("cvs.tailored.jobDescription");
  const text = (jobDescription ?? "").trim();

  return (
    <CvSectionCard
      title={t("title")}
      description={t("description")}
      icon={ClipboardList}
      className={className}
      contentClassName="p-0"
    >
      {text ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={t("textRegion")}
          className={cn(
            "max-h-72 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden",
          )}
        >
          {text}
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-pretty text-muted-foreground">
            {t("emptyHint")}
          </p>
          {onAdd && !disabled ? (
            <div className="flex justify-center">
              <Button type="button" size="sm" variant="outline" onClick={onAdd}>
                <Plus aria-hidden />
                {t("add")}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </CvSectionCard>
  );
}
