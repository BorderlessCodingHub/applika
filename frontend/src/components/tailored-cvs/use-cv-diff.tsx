"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useWatch, type FieldPath, type UseFormReturn } from "react-hook-form";

import type {
  CvFormDiffSlots,
  CvFormListSectionId,
  CvRemovedRowSlot,
} from "@/components/base-cvs/cv-form-diff";
import type { CvFormSectionId } from "@/components/base-cvs/cv-form-sections";
import type { CvFormValues } from "@/components/base-cvs/types";
import {
  CvAddedBadge,
  CV_DIFF_ADDED_ROW_CLASS,
} from "@/components/tailored-cvs/cv-added-badge";
import { CvChangedMarker } from "@/components/tailored-cvs/cv-changed-marker";
import {
  computeCvDiff,
  type CvDiffDetail,
  type CvDiffResult,
  type CvDiffSnapshot,
} from "@/components/tailored-cvs/cv-diff";
import { CvDiffSectionCount } from "@/components/tailored-cvs/cv-diff-section-count";
import { CvDiffSummaryBar } from "@/components/tailored-cvs/cv-diff-summary-bar";
import { CvRemovedRow } from "@/components/tailored-cvs/cv-removed-row";
import type { TailoredCvAdjustment } from "@/components/tailored-cvs/types";
import { isoToMonthYear } from "@/lib/month-year";

/** Lowercase singular per section, for `CvRemovedRow`'s caption. */
const ITEM_NOUN: Record<CvFormListSectionId, string> = {
  links: "link",
  skills: "category",
  experience: "experience",
  projects: "project",
  education: "education",
  certifications: "certification",
  languages: "language",
};

/** The date fields whose baseline value is displayed as `MM/yyyy`, not ISO. */
const DATE_FIELDS = new Set(["start", "end"]);

function formatPeriod(
  start?: string | null,
  end?: string | null,
): string | undefined {
  const from = isoToMonthYear(start ?? "");
  if (!from) return undefined;
  const to = isoToMonthYear(end ?? "");
  return to ? `${from} - ${to}` : `${from} - present`;
}

interface AnyItem {
  id: string;
  [key: string]: unknown;
}

/** Row caption per section, with the same fallback the section's own editor uses. */
function titleFor(section: CvFormListSectionId, item: AnyItem): string {
  switch (section) {
    case "links":
      return (item.label as string) || "New link";
    case "skills":
      return (item.category as string) || "New category";
    case "experience":
      return (item.role as string) || (item.company as string) || "New role";
    case "projects":
      return (item.name as string) || "New project";
    case "education":
      return (
        (item.institution as string) ||
        (item.degree as string) ||
        "New qualification"
      );
    case "certifications":
      return (item.name as string) || "New certification";
    case "languages":
      return (item.name as string) || "New language";
  }
}

/** Secondary caption line, e.g. "Stripe · 03/2021 - present". */
function detailFor(
  section: CvFormListSectionId,
  item: AnyItem,
): string | undefined {
  switch (section) {
    case "experience": {
      const period = formatPeriod(
        item.start as string,
        item.end as string | null,
      );
      return (
        [item.company as string, period].filter(Boolean).join(" · ") ||
        undefined
      );
    }
    case "education": {
      const period = formatPeriod(
        item.start as string,
        item.end as string | null,
      );
      return (
        [item.degree as string, period].filter(Boolean).join(" · ") || undefined
      );
    }
    case "links":
      return (item.url as string) || undefined;
    case "skills": {
      const keywords = (item.keywords as string[] | undefined) ?? [];
      return keywords.length ? keywords.join(", ") : undefined;
    }
    case "projects":
      return (item.link as string) || undefined;
    case "certifications":
      return (item.issuer as string) || undefined;
    case "languages":
      return (item.level as string) || undefined;
    default:
      return undefined;
  }
}

/** Parses a `CvFormDiffSlots.field` path into its item-field parts, or `null` for a scalar. */
function parseItemPath(
  path: string,
): { section: CvFormListSectionId; itemId: string; field: string } | null {
  const colon = path.indexOf(":");
  if (colon === -1) return null;
  const section = path.slice(0, colon) as CvFormListSectionId;
  const rest = path.slice(colon + 1);
  const dot = rest.lastIndexOf(".");
  if (dot === -1) return null;
  return { section, itemId: rest.slice(0, dot), field: rest.slice(dot + 1) };
}

const NO_ADJUSTMENTS: readonly TailoredCvAdjustment[] = [];

export interface UseCvDiffOptions {
  form: UseFormReturn<CvFormValues>;
  /** The baseline to compare against, or `null` when none resolves. */
  baseline: CvDiffSnapshot | null;
  /** The master CV's current name, or `null` (says "the original master CV"). */
  baselineLabel: string | null;
  /** A locked copy shows markers with no Revert/Restore. */
  readOnly: boolean;
  /**
   * The copy's `adjustments` (R-025): what "Tailor by keywords" reordered, per
   * section. Listed in the summary bar and marked "reordered" on the section
   * header while "Show changes" is on. Empty or absent renders as before.
   */
  adjustments?: readonly TailoredCvAdjustment[];
}

export interface UseCvDiffResult {
  /** Whether a baseline resolved at all — governs whether ANY diff UI renders. */
  hasBaseline: boolean;
  showChanges: boolean;
  setShowChanges: (next: boolean) => void;
  /** `CvDiffSummaryBar`, or `undefined` with no baseline. */
  diffSummary: ReactNode;
  /** Marker slots while "Show changes" is on; `undefined` otherwise. */
  slots: CvFormDiffSlots | undefined;
  /** The canonical diff, live — for the "Download changes" affordance. */
  diffResult: CvDiffResult | null;
}

/**
 * Builds `TailoredCvEditor`'s `diffSummary` and `diff` props from a baseline
 * and the form's own live values (KODI-017).
 *
 * Recomputes on every watched keystroke, so a revert or an edit updates the
 * counts immediately — `diffCv`/`computeCvDiff` (`cv-diff.ts`) are pure, this
 * hook is the only thing that watches the form and turns the result into
 * `CvChangedMarker`/`CvAddedBadge`/`CvRemovedRow` nodes and `setValue` calls.
 */
export function useCvDiff({
  form,
  baseline,
  baselineLabel,
  readOnly,
  adjustments = NO_ADJUSTMENTS,
}: UseCvDiffOptions): UseCvDiffResult {
  const [showChanges, setShowChanges] = useState(false);
  const watched = useWatch({ control: form.control }) as Partial<CvFormValues>;

  const detail: CvDiffDetail | null = useMemo(() => {
    if (!baseline) return null;
    return computeCvDiff(baseline, watched);
  }, [baseline, watched]);

  const hasBaseline = baseline !== null && detail !== null;

  const revertScalar = (path: string, before: unknown) => {
    form.setValue(path as FieldPath<CvFormValues>, (before ?? "") as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const revertItemField = (
    section: CvFormListSectionId,
    itemId: string,
    fieldName: string,
    before: unknown,
  ) => {
    const items = form.getValues(section) as unknown as AnyItem[];
    const index = items.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    // The list sections are ONE `Controller` over the whole array
    // (`cv-form-sections.tsx`): `setValue` on a NESTED path
    // (`experience.0.role`) updates `getValues()`/`useWatch` but never
    // notifies that Controller's own subscription, so the input on screen
    // keeps showing the value the user typed until an unrelated edit forces
    // a re-render. Rebuild the array and set the WHOLE section instead, the
    // same shape `restoreItem` below already uses.
    const next = items.map((item, i) =>
      i === index
        ? {
            ...item,
            [fieldName]: before ?? (fieldName === "bullets" ? [] : ""),
          }
        : item,
    );
    form.setValue(section as FieldPath<CvFormValues>, next as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const restoreItem = (
    section: CvFormListSectionId,
    item: unknown,
    at: number,
  ) => {
    const items = form.getValues(section) as unknown as AnyItem[];
    const next = [...items];
    const index = Math.max(0, Math.min(at, next.length));
    next.splice(index, 0, item as AnyItem);
    form.setValue(section as FieldPath<CvFormValues>, next as never, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const slots: CvFormDiffSlots | undefined = useMemo(() => {
    if (!showChanges || !detail || !baseline) return undefined;

    const field: CvFormDiffSlots["field"] = (path, fieldLabel) => {
      const parsed = parseItemPath(path);

      if (!parsed) {
        const change = detail.identity.find((c) => c.path === path);
        if (!change) return undefined;
        return (
          <CvChangedMarker
            fieldLabel={fieldLabel}
            original={(change.before as string | null) ?? ""}
            onRevert={
              readOnly ? undefined : () => revertScalar(path, change.before)
            }
          />
        );
      }

      const { section, itemId, field: fieldName } = parsed;

      if (section === "skills" && fieldName === "keywords") {
        const kw = detail.lists.skills.keywordChangesByItem?.get(itemId);
        if (!kw || (kw.added.length === 0 && kw.removed.length === 0)) {
          return undefined;
        }
        const baselineItem = baseline.skills.find((item) => item.id === itemId);
        return (
          <CvChangedMarker
            fieldLabel={fieldLabel}
            original={baselineItem?.keywords ?? []}
            added={kw.added}
            removed={kw.removed}
            onRevert={
              readOnly
                ? undefined
                : () =>
                    revertItemField(
                      "skills",
                      itemId,
                      "keywords",
                      baselineItem?.keywords ?? [],
                    )
            }
          />
        );
      }

      const listInfo = detail.lists[section];
      const change = listInfo?.changes.find(
        (c) => c.path === path && c.kind === "changed",
      );
      if (!change) return undefined;

      const isBullets = fieldName === "bullets";
      const isDate = DATE_FIELDS.has(fieldName);
      const original = isBullets
        ? ((change.before as string[]) ?? [])
        : isDate
          ? isoToMonthYear(change.before as string | null)
          : ((change.before as string | null) ?? "");

      return (
        <CvChangedMarker
          fieldLabel={fieldLabel}
          original={original}
          onRevert={
            readOnly
              ? undefined
              : () => revertItemField(section, itemId, fieldName, change.before)
          }
        />
      );
    };

    const sectionStatus = (section: CvFormSectionId): ReactNode => {
      const count = detail.canonical.sections[section] ?? 0;
      const reordered = adjustments.some((a) => a.section === section);
      if (count <= 0 && !reordered) return undefined;
      return <CvDiffSectionCount count={count} reordered={reordered} />;
    };

    const itemBadge = (
      section: CvFormListSectionId,
      itemId: string,
    ): ReactNode => {
      if (detail.lists[section]?.addedIds.has(itemId)) return <CvAddedBadge />;
      return undefined;
    };

    const itemClassName = (
      section: CvFormListSectionId,
      itemId: string,
    ): string | undefined => {
      if (detail.lists[section]?.addedIds.has(itemId)) {
        return CV_DIFF_ADDED_ROW_CLASS;
      }
      return undefined;
    };

    const removedRows = (
      section: CvFormListSectionId,
    ): readonly CvRemovedRowSlot[] | undefined => {
      const list = detail.lists[section]?.removedList;
      if (!list?.length) return undefined;
      return list.map((entry) => {
        const item = entry.item as AnyItem;
        return {
          key: entry.id,
          at: entry.at,
          node: (
            <CvRemovedRow
              itemId={entry.id}
              itemNoun={ITEM_NOUN[section]}
              title={titleFor(section, item)}
              detail={detailFor(section, item)}
              onRestore={
                readOnly
                  ? undefined
                  : () => restoreItem(section, item, entry.at)
              }
            />
          ),
        };
      });
    };

    return { field, sectionStatus, itemBadge, itemClassName, removedRows };
    // `form` is stable (react-hook-form) and only read through `getValues`/
    // `setValue` inside the callbacks, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChanges, detail, baseline, readOnly, adjustments]);

  const diffSummary: ReactNode = useMemo(() => {
    if (!hasBaseline || !detail) return undefined;
    return (
      <CvDiffSummaryBar
        baselineLabel={baselineLabel}
        count={detail.canonical.total}
        showChanges={showChanges}
        onShowChangesChange={setShowChanges}
        adjustments={adjustments}
      />
    );
  }, [hasBaseline, detail, baselineLabel, showChanges, adjustments]);

  return {
    hasBaseline,
    showChanges,
    setShowChanges,
    diffSummary,
    slots,
    diffResult: detail?.canonical ?? null,
  };
}
