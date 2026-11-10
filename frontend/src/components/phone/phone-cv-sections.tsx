"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormState, useWatch, type UseFormReturn } from "react-hook-form";
import {
  CV_FORM_SECTION_IDS,
  CvFormSections,
  cvSectionHasError,
  type CvFormSectionId,
} from "@/components/base-cvs/cv-form-sections";
import {
  CvSectionFrame,
  type CvSectionFrameProps,
} from "@/components/base-cvs/cv-section-card";
import type { CvFormDiffSlots } from "@/components/base-cvs/cv-form-diff";
import { skillKeywords, type CvFormValues } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

export interface PhoneCvSectionsProps {
  /** The page's react-hook-form instance (master CV or the draft's CV copy). */
  form: UseFormReturn<CvFormValues>;
  /** While saving: every field locked, as `CvFormSections` does. */
  disabled?: boolean;
  newItemId?: () => string;
  /** The rows' heading level: `h2` under the editor's h1, `h3` under the draft's "Edit the CV copy". */
  headingLevel?: "h2" | "h3";
  /**
   * A row's second line: `meta` (v2/CVEditor: what the section holds) or
   * `description` (v3/CVNew: the section's description, Identity included,
   * and the open panel no longer repeats it).
   */
  subline?: "meta" | "description";
  /** The row open on load; `null` opens none (v3/ApplicationCV draws every row closed). */
  firstOpen?: CvFormSectionId | null;
  /** A CV copy's markers, passed to `CvFormSections`; a section's `status` sits under its row. */
  diff?: CvFormDiffSlots;
  /**
   * Sections the keyword tailoring reordered: their `meta` line ends
   * "· Reordered" (v3/ApplicationCV). The row says it, so a `diff` status
   * passed with it must not say it again.
   */
  reordered?: ReadonlySet<CvFormSectionId>;
  className?: string;
}

/** The board opens Identity and contact first. */
const FIRST_OPEN: CvFormSectionId = "identity";

function isSectionId(value: string | undefined): value is CvFormSectionId {
  return CV_FORM_SECTION_IDS.includes(value as CvFormSectionId);
}

/**
 * v2/CVEditor's `acc` list: one row per section of today's `CvFormSections`
 * (its fields, its validation, its order), drawn through `CvSectionFrame`.
 * Opening a row closes the others, as the board does; a submit that leaves
 * errors opens every section holding one, so no message hides behind a
 * closed row.
 */
export function PhoneCvSections({
  form,
  disabled,
  newItemId,
  headingLevel = "h2",
  subline = "meta",
  firstOpen = FIRST_OPEN,
  diff,
  reordered,
  className,
}: PhoneCvSectionsProps) {
  const t = useTranslations("phone.cvEditor");
  const tDraft = useTranslations("phone.draft");
  const { errors, submitCount } = useFormState({ control: form.control });
  const values = useWatch({ control: form.control }) as Partial<CvFormValues>;
  const [disclosure, setDisclosure] = useState(() => ({
    submitCount,
    open: new Set<CvFormSectionId>([
      ...(firstOpen ? [firstOpen] : []),
      ...CV_FORM_SECTION_IDS.filter((id) => cvSectionHasError(id, errors)),
    ]),
  }));
  if (disclosure.submitCount !== submitCount) {
    const open = new Set(disclosure.open);
    for (const id of CV_FORM_SECTION_IDS) {
      if (cvSectionHasError(id, errors)) open.add(id);
    }
    setDisclosure({ submitCount, open });
  }

  const toggle = (id: CvFormSectionId) => {
    const open = disclosure.open.has(id)
      ? new Set([...disclosure.open].filter((other) => other !== id))
      : new Set<CvFormSectionId>([id]);
    setDisclosure({ submitCount, open });
  };

  const metaFor = (id: CvFormSectionId): string => {
    switch (id) {
      case "identity":
        return [values.full_name?.trim(), values.headline?.trim()]
          .filter(Boolean)
          .join(" · ");
      case "links":
        return t("meta.links", { count: values.links?.length ?? 0 });
      case "summary":
        return t("meta.summary", {
          count: values.summary?.trim().length ?? 0,
        });
      case "skills": {
        const skills = (values.skills ?? []).map((entry) => ({
          id: entry?.id ?? "",
          category: entry?.category ?? "",
          keywords: (entry?.keywords ?? []).filter(
            (keyword): keyword is string => typeof keyword === "string",
          ),
        }));
        return t("meta.skills", {
          groups: skills.length,
          keywords: skillKeywords(skills).length,
        });
      }
      case "experience":
        return t("meta.experience", { count: values.experience?.length ?? 0 });
      case "projects":
        return t("meta.projects", { count: values.projects?.length ?? 0 });
      case "education":
        return t("meta.education", { count: values.education?.length ?? 0 });
      case "certifications":
        return t("meta.certifications", {
          count: values.certifications?.length ?? 0,
        });
      case "languages":
        return t("meta.languages", { count: values.languages?.length ?? 0 });
    }
  };

  const metaLine = (id: CvFormSectionId): string => {
    const meta = metaFor(id);
    if (!reordered?.has(id)) return meta;
    return [meta || t("meta.empty"), tDraft("reordered")].join(" · ");
  };

  const frame = (section: CvSectionFrameProps) => {
    const id = isSectionId(section.sectionId) ? section.sectionId : null;
    if (!id) return section.children;
    const byDescription = subline === "description";
    return (
      <PhoneCvSectionRow
        id={id}
        headingLevel={headingLevel}
        title={section.title}
        description={
          byDescription || id === FIRST_OPEN ? undefined : section.description
        }
        meta={byDescription ? section.description : metaLine(id)}
        invalid={cvSectionHasError(id, errors)}
        open={disclosure.open.has(id)}
        onToggle={() => toggle(id)}
        status={section.status}
        statusId={section.statusId}
      >
        {section.children}
      </PhoneCvSectionRow>
    );
  };

  return (
    <CvSectionFrame.Provider value={frame}>
      <CvFormSections
        form={form}
        disabled={disabled}
        newItemId={newItemId}
        diff={diff}
        className={cn("ph-group ph-ce-list space-y-0", className)}
      />
    </CvSectionFrame.Provider>
  );
}

function PhoneCvSectionRow({
  id,
  headingLevel: Heading,
  title,
  description,
  meta,
  invalid,
  open,
  onToggle,
  status,
  statusId,
  children,
}: {
  id: CvFormSectionId;
  headingLevel: "h2" | "h3";
  title: string;
  description?: ReactNode;
  meta: ReactNode;
  invalid: boolean;
  open: boolean;
  onToggle: () => void;
  status?: ReactNode;
  statusId?: string;
  children: ReactNode;
}) {
  const t = useTranslations("phone.cvEditor");
  const base = useId();
  const titleId = `${base}-title`;
  const metaId = `${base}-meta`;
  const panelId = `${base}-panel`;
  const hasStatus = status !== undefined && status !== null && status !== false;
  const describedBy = [metaId, hasStatus ? statusId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      data-slot="cv-acc"
      data-section={id}
      data-open={open || undefined}
      data-invalid={invalid || undefined}
    >
      {/* The WAI-ARIA accordion shape: a heading whose one child is the trigger. */}
      <Heading className="ph-acc-h">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-labelledby={titleId}
          aria-describedby={describedBy}
          data-action="toggle-cv-section"
          className="ph-acc"
          onClick={onToggle}
        >
          <span className="ph-acc-text">
            <span id={titleId} className="ph-acc-t">
              {title}
            </span>
            <span
              id={metaId}
              className={cn("ph-acc-m", invalid && "ph-acc-bad")}
            >
              {invalid ? t("invalid") : meta || t("meta.empty")}
            </span>
          </span>
          <ChevronDown size={18} aria-hidden="true" className="ph-chev" />
        </button>
      </Heading>
      {hasStatus ? (
        <div id={statusId} className="ph-ce-status">
          {status}
        </div>
      ) : null}
      <div id={panelId} hidden={!open} className="ph-ce-panel">
        {open ? (
          <>
            {description ? <p className="ph-hint">{description}</p> : null}
            {children}
          </>
        ) : null}
      </div>
    </div>
  );
}
