"use client";

import { useId, type ReactNode } from "react";
import { BadgeCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  CV_FIELD_MARKED_CLASS,
  CV_FIELD_MARKER_GUTTER,
  CvField,
  hasMarker,
} from "@/components/base-cvs/cv-editor-fields";
import type { CvRemovedRowSlot } from "@/components/base-cvs/cv-form-diff";
import {
  CV_KEYWORDS_COPY,
  CvKeywordsInput,
} from "@/components/base-cvs/cv-keywords-input";
import { CvRepeatableSection } from "@/components/base-cvs/cv-repeatable-section";
import type { CvCollapsibleProps } from "@/components/base-cvs/cv-section-card";
import type { CvSkillCategory } from "@/components/base-cvs/types";
import { liveCopy } from "@/i18n/translator";
import { cn } from "@/lib/utils";

/**
 * The skills section's hints, in the active language (`cvs.sections.skills.*`):
 * `emptyHint` when the section carries no category at all,
 * `categoryEmptyHint` inside a category that carries no keyword yet.
 * Never spread it.
 */
export const CV_SKILLS_COPY = liveCopy("cvs.sections.skills", [
  "emptyHint",
  "categoryEmptyHint",
]);

export interface CvSkillsSectionProps extends CvCollapsibleProps {
  /** Controlled list of categories, in print order. */
  value: CvSkillCategory[];
  /** Called with the next list on add, edit, move or remove. */
  onChange: (next: CvSkillCategory[]) => void;
  /** Mints the client-generated id of a new category. */
  newItemId: () => string;
  /** Disables every control — while saving, and in a read-only editor. */
  disabled?: boolean;
  /** Section-level validation message. */
  error?: string;
  /** DOM id for that message, so the keyword entries can point at it. */
  errorId?: string;
  /** Optional caps. */
  maxCategories?: number;
  maxKeywordsPerCategory?: number;
  /** Diff slots; see `CvRepeatableSection` and `CvField`. */
  status?: ReactNode;
  statusId?: string;
  itemBadge?: (item: CvSkillCategory, index: number) => ReactNode;
  itemClassName?: (item: CvSkillCategory, index: number) => string | undefined;
  removedRows?: readonly CvRemovedRowSlot[];
  fieldMarker?: (
    item: CvSkillCategory,
    index: number,
    field: "category" | "keywords",
  ) => ReactNode;
  className?: string;
}

/**
 * The skills editor: a list of NAMED categories, each with its own keywords.
 * Skills are not a flat tag list — the document prints one bold category line
 * with its keywords under it, joined by a middle dot, and this editor is the
 * shape of that render.
 *
 * A category is an ordinary repeatable row (add, move, remove come from
 * `CvRepeatableSection`); what is nested inside it is the keyword chip field.
 * Controlled and presentation-only: the parent owns the value and validation.
 */
export function CvSkillsSection({
  value,
  onChange,
  newItemId,
  disabled = false,
  error,
  errorId,
  maxCategories,
  maxKeywordsPerCategory,
  status,
  statusId,
  itemBadge,
  itemClassName,
  removedRows,
  fieldMarker,
  className,
  collapsible,
  defaultOpen,
  open,
  onOpenChange,
}: CvSkillsSectionProps) {
  const t = useTranslations("cvs.sections.skills");
  const hintBaseId = useId();

  return (
    <CvRepeatableSection<CvSkillCategory>
      title={t("title")}
      description={t("description")}
      icon={BadgeCheck}
      items={value}
      onChange={onChange}
      createItem={() => ({ id: newItemId(), category: "", keywords: [] })}
      itemLabel={(item) => item.category || t("newItem")}
      addLabel={t("add")}
      itemNoun={t("noun")}
      emptyHint={t("emptyHint")}
      max={maxCategories}
      disabled={disabled}
      status={status}
      statusId={statusId}
      itemBadge={itemBadge}
      itemClassName={itemClassName}
      removedRows={removedRows}
      className={className}
      collapsible={collapsible}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
      footer={
        error ? (
          <p id={errorId} className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null
      }
      renderItem={({ item, index, update }) => {
        const hintId = `${hintBaseId}-${item.id}`;
        // THIS row is the one at fault only when it is the shape the section
        // error describes: keywords with no category to print them under. A
        // section-level message must not paint every sibling row red, and the
        // control it points at has to be the empty one — the category name,
        // never the keyword entry that is perfectly valid.
        //
        // The keyword test is TRIMMED, to mirror the schema's `lines()`
        // exactly. A row whose only keyword is whitespace is blank to the
        // schema, so it never causes the error and must not wear it either.
        const rowInvalid =
          Boolean(error) &&
          item.category.trim() === "" &&
          item.keywords.some((keyword) => keyword.trim() !== "");
        const keywordsMarker = fieldMarker?.(item, index, "keywords");
        const keywordsMarked = hasMarker(keywordsMarker);
        return (
          <div className="space-y-3">
            <CvField
              label={t("category")}
              marker={fieldMarker?.(item, index, "category")}
            >
              <Input
                value={item.category}
                disabled={disabled}
                placeholder={t("categoryPlaceholder")}
                aria-invalid={rowInvalid ? true : undefined}
                aria-describedby={rowInvalid ? errorId : undefined}
                className={cn(
                  rowInvalid &&
                    "border-destructive focus-visible:ring-destructive",
                )}
                onChange={(event) => update({ category: event.target.value })}
              />
            </CvField>

            {/*
              Not a `CvField`: its `<label>` WRAPS the control, and the first
              labelable node inside a keyword field is a chip button — the
              label would name that button instead of the field.
            */}
            <div
              className={cn(
                "space-y-1.5",
                keywordsMarked && CV_FIELD_MARKED_CLASS,
              )}
            >
              <span
                className={cn(
                  "block text-sm leading-none font-medium",
                  keywordsMarked && CV_FIELD_MARKER_GUTTER,
                )}
              >
                {t("keywords")}
              </span>
              {keywordsMarker}
              <CvKeywordsInput
                value={item.keywords}
                groupLabel={item.category || t("thisCategory")}
                disabled={disabled}
                maxKeywords={maxKeywordsPerCategory}
                aria-describedby={hintId}
                onChange={(keywords) => update({ keywords })}
              />
              <p
                id={hintId}
                className="text-xs text-pretty text-muted-foreground"
              >
                {item.keywords.length === 0
                  ? `${t("categoryEmptyHint")} ${CV_KEYWORDS_COPY.hint}`
                  : CV_KEYWORDS_COPY.hint}
              </p>
            </div>
          </div>
        );
      }}
    />
  );
}
