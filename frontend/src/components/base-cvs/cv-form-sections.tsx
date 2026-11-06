"use client";

import { useMemo, useState } from "react";
import { Controller, useFormState, useWatch } from "react-hook-form";
import { useTranslations } from "next-intl";
import type {
  Control,
  FieldErrors,
  FieldPath,
  UseFormReturn,
} from "react-hook-form";
import {
  Award,
  Briefcase,
  FolderGit2,
  GraduationCap,
  Languages,
  Link2,
  ScrollText,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { MonthYearInput } from "@/components/ui/month-year-input";
import { Textarea } from "@/components/ui/textarea";
import {
  CvField,
  CvSelectField,
  CvStringListField,
} from "@/components/base-cvs/cv-editor-fields";
import { CvRepeatableSection } from "@/components/base-cvs/cv-repeatable-section";
import { CvSectionCard } from "@/components/base-cvs/cv-section-card";
import { CvSkillsSection } from "@/components/base-cvs/cv-skills-section";
import type { CvDocumentData } from "@/components/base-cvs/cv-document";
import {
  cvItemFieldDiffPath,
  type CvFormDiffSlots,
  type CvFormListSectionId,
  type CvListItem,
  type CvScalarDiffPath,
} from "@/components/base-cvs/cv-form-diff";
import {
  CV_LANGUAGE_LEVELS,
  LANGUAGE_LEVEL_KEY,
  type CvCertification,
  type CvEducation,
  type CvExperience,
  type CvFormValues,
  type CvLanguage,
  type CvLink,
  type CvProject,
} from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

/** Client-generated id for a new section row. */
export function defaultNewItemId(): string {
  // jsdom and insecure origins have no crypto.randomUUID.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `cv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The form values as the document renderer wants them, watched live.
 *
 * `useWatch` types every nested field as optional; the resolver guarantees the
 * shape, so the gaps are filled with empties rather than asserted away.
 */
export function useCvPreviewData(
  control: Control<CvFormValues>,
): CvDocumentData {
  const watched = useWatch({ control }) as Partial<CvFormValues>;

  return {
    name: watched.name ?? "",
    full_name: watched.full_name ?? "",
    headline: watched.headline ?? "",
    location: watched.location ?? "",
    email: watched.email ?? "",
    phone: watched.phone ?? "",
    summary: watched.summary ?? "",
    links: watched.links ?? [],
    skills: watched.skills ?? [],
    experience: watched.experience ?? [],
    projects: watched.projects ?? [],
    education: watched.education ?? [],
    certifications: watched.certifications ?? [],
    languages: watched.languages ?? [],
  };
}

/** The collapsible sections of the CV form, in the order they render. */
export const CV_FORM_SECTION_IDS = [
  "identity",
  "links",
  "summary",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "languages",
] as const;

export type CvFormSectionId = (typeof CV_FORM_SECTION_IDS)[number];

/** Which form fields live under which section header. */
const CV_SECTION_FIELDS: Record<
  CvFormSectionId,
  readonly (keyof CvFormValues)[]
> = {
  identity: ["name", "full_name", "headline", "email", "phone", "location"],
  links: ["links"],
  summary: ["summary"],
  skills: ["skills"],
  experience: ["experience"],
  projects: ["projects"],
  education: ["education"],
  certifications: ["certifications"],
  languages: ["languages"],
};

/** True when any field under `id` currently carries a validation message. */
export function cvSectionHasError(
  id: CvFormSectionId,
  errors: FieldErrors<CvFormValues>,
): boolean {
  return CV_SECTION_FIELDS[id].some((field) => Boolean(errors[field]));
}

/** Stable empty list, so a section with no reveal never churns the effect. */
const NO_REVEAL: readonly string[] = [];

/**
 * Open/close state for the section headers, all OPEN on first render.
 *
 * The seam behind criterion 6: a section named in `invalidSections` is forced
 * open, so a submit can never leave an error behind a collapsed header.
 *
 * The reveal is keyed on the CONTENT of that list plus `revealNonce`, never on
 * the list's identity — the caller rebuilds it every render, and an
 * identity-keyed reveal would re-open a section on every keystroke and fight
 * the user who collapsed it on purpose. `revealNonce` is the form's submit
 * count: the owner's criterion is "expanded automatically when the user
 * submits", so EVERY submit reveals, including the second one that fails on
 * the very same error the user just folded away.
 *
 * What the key does NOT promise: that a header the user closed survives until
 * the next submit no matter what. The invalid list is part of the key, so
 * fixing some OTHER section changes it and re-reveals whatever is still
 * invalid. That is the safe direction — it errs towards showing a message
 * rather than hiding one, which is the whole point of the seam — but it is
 * more than "nothing moves between two submits", and the comment should not
 * claim otherwise.
 *
 * A reveal is COMMITTED, not merely derived for as long as the error lasts.
 * Deriving it would fold the section away again the instant the user finished
 * fixing the message — the error clears, the reveal with it, and the stored
 * "closed" reasserts itself over a field the user is still typing in. That is
 * an unrequested context change on input (WCAG 3.2.2) in the one flow this
 * seam exists to protect, and it takes keyboard focus with it. So a revealed
 * section stays open until the USER closes it again.
 */
export function useCvSectionDisclosure(
  invalidSections: readonly CvFormSectionId[],
  revealNonce: string | number = "",
) {
  // Stamped with the reveal it was recorded against. The commit happens DURING
  // RENDER — React's "adjust state when a prop changes" pattern, which
  // re-renders immediately and converges on the next pass because the stamp
  // then matches. Never in an effect: `react-hooks/set-state-in-effect` is an
  // error under the React Compiler config, and an effect would paint the
  // collapsed frame first.
  const revealKey = `${revealNonce}\u0000${invalidSections.join("\u0000")}`;

  // Seeded with the CURRENT key, not `""`: nothing is closed at mount, so the
  // prune there is provably a no-op, and seeding a key that can never match
  // would buy a guaranteed second render pass on every mount for nothing.
  const [closed, setClosed] = useState<{
    revealKey: string;
    ids: ReadonlySet<CvFormSectionId>;
  }>(() => ({ revealKey, ids: new Set<CvFormSectionId>() }));

  if (closed.revealKey !== revealKey) {
    const draft = new Set(closed.ids);
    for (const id of revealKey.split("\u0000").slice(1)) {
      if (id) draft.delete(id as CvFormSectionId);
    }
    setClosed({ revealKey, ids: draft });
  }

  const closedIds = closed.ids;

  return useMemo(
    () => ({
      isOpen: (id: CvFormSectionId) => !closedIds.has(id),
      setOpen: (id: CvFormSectionId, open: boolean) => {
        if (closedIds.has(id) === !open) return;
        const draft = new Set(closedIds);
        if (open) draft.delete(id);
        else draft.add(id);
        setClosed({ revealKey, ids: draft });
      },
    }),
    [closedIds, revealKey],
  );
}

export interface CvFormSectionsProps {
  /** The react-hook-form instance. The caller owns the schema and the defaults. */
  form: UseFormReturn<CvFormValues>;
  /** Disables every control — while saving, and in a read-only editor. */
  disabled?: boolean;
  /** Mints ids for new section rows. Defaults to `crypto.randomUUID()`. */
  newItemId?: () => string;
  /**
   * Section ids to force OPEN, on top of the ones the form's own errors
   * already reveal. For a failure the resolver cannot see — a server-side
   * rejection the page maps back onto a section.
   */
  revealSections?: readonly CvFormSectionId[];
  /** A CV copy's diff markers; the master CV never passes it. See `CvFormDiffSlots`. */
  diff?: CvFormDiffSlots;
  className?: string;
}

/**
 * The CV field body: identity and contact, links, summary, skills, experience,
 * projects, education, certifications and languages, in that order, with the
 * inline errors the form already holds.
 *
 * The owner's order, KODI-009: "change the links position to above summary,
 * today is identity, summary and links..., i want identity, links and
 * summary...". This is the EDITOR's order only. The typeset document's section
 * order is pinned against the server's `mapper.py` and is not this list; links
 * are not a document section at all, they print in its header.
 *
 * Every section is a disclosure, open on load, and the Experience rows are
 * disclosures of their own. A section whose fields fail validation is forced
 * open — see {@link useCvSectionDisclosure}.
 *
 * Shared by `BaseCvEditor` (the master CV) and `TailoredCvEditor` (an
 * application's copy) so the two can never drift. It renders NO `<form>`, no
 * preview and no footer — the editor around it owns those. It is a
 * `@container/cv-form`, which is what the `@lg/cv-form:` variants inside answer
 * to, so it lays out to its own column rather than to the viewport.
 */
export function CvFormSections({
  form,
  disabled = false,
  newItemId = defaultNewItemId,
  revealSections,
  diff,
  className,
}: CvFormSectionsProps) {
  const { control, register } = form;
  const { errors, submitCount } = useFormState({ control });
  const t = useTranslations("cvs.sections");
  const f = useTranslations("cvs.fields.label");
  const n = useTranslations("cvs.fields.noun");
  const h = useTranslations("cvs.fields.hint");
  const p = useTranslations("cvs.fields.placeholder");
  const fields = useTranslations("cvs.fields");

  const invalidSections = useMemo(
    () => [
      ...CV_FORM_SECTION_IDS.filter((id) => cvSectionHasError(id, errors)),
      ...(revealSections ?? []),
    ],
    [errors, revealSections],
  );
  // Every submit reveals, even the second one that fails on the same error
  // (AC6): the nonce moves, so a header the user folded away in between is
  // opened again rather than left hiding a message.
  const disclosure = useCvSectionDisclosure(invalidSections, submitCount);
  const sectionProps = (id: CvFormSectionId) => ({
    open: disclosure.isOpen(id),
    onOpenChange: (next: boolean) => disclosure.setOpen(id, next),
  });

  // The schema validates experience as a WHOLE array (`base-cv-schema.ts` uses
  // `.refine` on the list, so there is no per-index path to read). Until that
  // changes, a section error reveals every row of it: over-revealing keeps the
  // promise that no message points at a field nobody can see.
  const revealExperienceRows = (rows: CvExperience[] | undefined) =>
    cvSectionHasError("experience", errors)
      ? (rows ?? []).map((row) => row.id)
      : NO_REVEAL;

  const errorFor = (field: FieldPath<CvFormValues>): string | undefined => {
    const message = errors[field as keyof typeof errors]?.message;
    return typeof message === "string" ? message : undefined;
  };

  const errorId = (field: FieldPath<CvFormValues>) => `cv-${field}-error`;

  const invalid = (field: FieldPath<CvFormValues>) =>
    cn(errorFor(field) && "border-destructive focus-visible:ring-destructive");

  const marker = (field: CvScalarDiffPath, label: string) =>
    diff?.field(field, label);

  const itemMarker = <S extends CvFormListSectionId>(
    section: S,
    noun: string,
    item: CvListItem<S>,
    index: number,
    field: Exclude<keyof CvListItem<S>, "id"> & string,
    label: string,
  ) =>
    diff?.field(
      cvItemFieldDiffPath(section, item.id, field),
      `${label}, ${noun} ${index + 1}`,
    );

  const sectionDiff = (id: CvFormSectionId) =>
    diff
      ? { status: diff.sectionStatus(id), statusId: `cv-${id}-changes` }
      : {};

  const listDiff = <S extends CvFormListSectionId>(section: S) =>
    diff
      ? {
          ...sectionDiff(section),
          itemBadge: (item: CvListItem<S>) => diff.itemBadge(section, item.id),
          itemClassName: (item: CvListItem<S>) =>
            diff.itemClassName(section, item.id),
          removedRows: diff.removedRows(section),
        }
      : {};

  return (
    <div className={cn("@container/cv-form min-w-0 space-y-4", className)}>
      <CvSectionCard
        {...sectionProps("identity")}
        {...sectionDiff("identity")}
        title={t("identity.title")}
        description={t("identity.description")}
        icon={UserRound}
      >
        <div className="grid gap-4 @lg/cv-form:grid-cols-2">
          <CvField
            label={f("cvLabel")}
            required
            error={errorFor("name")}
            errorId={errorId("name")}
            marker={marker("name", f("cvLabel"))}
            hint={h("cvLabel")}
            className="@lg/cv-form:col-span-2"
          >
            <Input
              {...register("name")}
              disabled={disabled}
              placeholder={p("cvLabel")}
              aria-invalid={errorFor("name") ? true : undefined}
              aria-describedby={errorFor("name") ? errorId("name") : undefined}
              className={invalid("name")}
            />
          </CvField>
          <CvField
            label={f("fullName")}
            required
            error={errorFor("full_name")}
            errorId={errorId("full_name")}
            marker={marker("full_name", f("fullName"))}
          >
            <Input
              {...register("full_name")}
              disabled={disabled}
              placeholder="Ada Lovelace"
              aria-invalid={errorFor("full_name") ? true : undefined}
              aria-describedby={
                errorFor("full_name") ? errorId("full_name") : undefined
              }
              className={invalid("full_name")}
            />
          </CvField>
          <CvField
            label={f("headline")}
            required
            error={errorFor("headline")}
            errorId={errorId("headline")}
            marker={marker("headline", f("headline"))}
          >
            <Input
              {...register("headline")}
              disabled={disabled}
              placeholder={p("headline")}
              aria-invalid={errorFor("headline") ? true : undefined}
              aria-describedby={
                errorFor("headline") ? errorId("headline") : undefined
              }
              className={invalid("headline")}
            />
          </CvField>
          <CvField
            label={f("email")}
            required
            error={errorFor("email")}
            errorId={errorId("email")}
            marker={marker("email", f("email"))}
          >
            <Input
              {...register("email")}
              type="email"
              disabled={disabled}
              placeholder="ada@example.com"
              aria-invalid={errorFor("email") ? true : undefined}
              aria-describedby={
                errorFor("email") ? errorId("email") : undefined
              }
              className={invalid("email")}
            />
          </CvField>
          <CvField
            label={f("phone")}
            error={errorFor("phone")}
            errorId={errorId("phone")}
            marker={marker("phone", f("phone"))}
            hint={h("optional")}
          >
            <Input
              {...register("phone")}
              type="tel"
              disabled={disabled}
              placeholder="+44 20 7946 0958"
              aria-invalid={errorFor("phone") ? true : undefined}
              aria-describedby={
                errorFor("phone") ? errorId("phone") : undefined
              }
              className={invalid("phone")}
            />
          </CvField>
          <CvField
            label={f("location")}
            required
            error={errorFor("location")}
            errorId={errorId("location")}
            marker={marker("location", f("location"))}
            className="@lg/cv-form:col-span-2"
          >
            <Input
              {...register("location")}
              disabled={disabled}
              placeholder={p("location")}
              aria-invalid={errorFor("location") ? true : undefined}
              aria-describedby={
                errorFor("location") ? errorId("location") : undefined
              }
              className={invalid("location")}
            />
          </CvField>
        </div>
      </CvSectionCard>

      <Controller
        control={control}
        name="links"
        render={({ field }) => (
          <CvRepeatableSection<CvLink>
            {...sectionProps("links")}
            {...listDiff("links")}
            title={t("links.title")}
            description={t("links.description")}
            icon={Link2}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({ id: newItemId(), label: "", url: "" })}
            itemLabel={(item) => item.label || t("links.newItem")}
            addLabel={t("links.add")}
            itemNoun={n("link")}
            emptyHint={t("links.emptyHint")}
            disabled={disabled}
            renderItem={({ item, index, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField
                  label={f("label")}
                  marker={itemMarker(
                    "links",
                    n("link"),
                    item,
                    index,
                    "label",
                    f("label"),
                  )}
                >
                  <Input
                    value={item.label}
                    disabled={disabled}
                    placeholder="GitHub"
                    onChange={(event) => update({ label: event.target.value })}
                  />
                </CvField>
                <CvField
                  label={f("url")}
                  marker={itemMarker(
                    "links",
                    n("link"),
                    item,
                    index,
                    "url",
                    f("url"),
                  )}
                >
                  <Input
                    value={item.url}
                    disabled={disabled}
                    placeholder="https://github.com/ada"
                    onChange={(event) => update({ url: event.target.value })}
                  />
                </CvField>
              </div>
            )}
          />
        )}
      />

      <CvSectionCard
        {...sectionProps("summary")}
        {...sectionDiff("summary")}
        title={t("summary.title")}
        description={t("summary.description")}
        icon={ScrollText}
      >
        <CvField
          label={f("summary")}
          required
          error={errorFor("summary")}
          errorId={errorId("summary")}
          marker={marker("summary", f("summary"))}
        >
          <Textarea
            {...register("summary")}
            rows={5}
            disabled={disabled}
            placeholder={p("summary")}
            aria-invalid={errorFor("summary") ? true : undefined}
            aria-describedby={
              errorFor("summary") ? errorId("summary") : undefined
            }
            className={invalid("summary")}
          />
        </CvField>
      </CvSectionCard>

      <Controller
        control={control}
        name="skills"
        render={({ field }) => (
          <CvSkillsSection
            {...sectionProps("skills")}
            {...listDiff("skills")}
            fieldMarker={
              diff
                ? (item, index, field) =>
                    itemMarker(
                      "skills",
                      n("category"),
                      item,
                      index,
                      field,
                      field === "category" ? f("category") : f("keywords"),
                    )
                : undefined
            }
            value={field.value ?? []}
            onChange={field.onChange}
            newItemId={newItemId}
            disabled={disabled}
            error={errorFor("skills")}
            errorId={errorId("skills")}
          />
        )}
      />

      <Controller
        control={control}
        name="experience"
        render={({ field }) => (
          <CvRepeatableSection<CvExperience>
            {...sectionProps("experience")}
            {...listDiff("experience")}
            collapsibleItems
            revealItemIds={revealExperienceRows(field.value)}
            revealNonce={submitCount}
            title={t("experience.title")}
            description={t("experience.description")}
            icon={Briefcase}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({
              id: newItemId(),
              company: "",
              role: "",
              start: "",
              bullets: [],
            })}
            itemLabel={(item) =>
              item.role || item.company || t("experience.newItem")
            }
            addLabel={t("experience.add")}
            itemNoun={n("experience")}
            emptyHint={t("experience.emptyHint")}
            disabled={disabled}
            renderItem={({ item, index, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField
                  label={f("company")}
                  marker={itemMarker(
                    "experience",
                    n("experience"),
                    item,
                    index,
                    "company",
                    f("company"),
                  )}
                >
                  <Input
                    value={item.company}
                    disabled={disabled}
                    placeholder="Stripe"
                    onChange={(event) =>
                      update({ company: event.target.value })
                    }
                  />
                </CvField>
                <CvField
                  label={f("role")}
                  marker={itemMarker(
                    "experience",
                    n("experience"),
                    item,
                    index,
                    "role",
                    f("role"),
                  )}
                >
                  <Input
                    value={item.role}
                    disabled={disabled}
                    placeholder={p("role")}
                    onChange={(event) => update({ role: event.target.value })}
                  />
                </CvField>
                {/*
                  Company -> role -> WHEN -> where. Start and Finish share a
                  row at `@lg/cv-form` and stack below it; the label is exactly
                  `Start`/`Finish` in both sections, disambiguated by the row's
                  own `role="group"` name, never qualified further.
                */}
                <CvField
                  label={f("start")}
                  marker={itemMarker(
                    "experience",
                    n("experience"),
                    item,
                    index,
                    "start",
                    f("start"),
                  )}
                  required
                  hint={h("monthYear")}
                >
                  <MonthYearInput
                    value={item.start}
                    disabled={disabled}
                    aria-required
                    onChange={(start) => update({ start })}
                  />
                </CvField>
                <CvField
                  label={f("finish")}
                  marker={itemMarker(
                    "experience",
                    n("experience"),
                    item,
                    index,
                    "end",
                    f("finish"),
                  )}
                  hint={h("finishRole")}
                >
                  <MonthYearInput
                    value={item.end ?? ""}
                    disabled={disabled}
                    onChange={(end) => update({ end })}
                  />
                </CvField>
                <CvField
                  label={f("location")}
                  marker={itemMarker(
                    "experience",
                    n("experience"),
                    item,
                    index,
                    "location",
                    f("location"),
                  )}
                >
                  <Input
                    value={item.location ?? ""}
                    disabled={disabled}
                    placeholder={p("remote")}
                    onChange={(event) =>
                      update({ location: event.target.value })
                    }
                  />
                </CvField>
                <CvField
                  label={f("companyDescription")}
                  marker={itemMarker(
                    "experience",
                    n("experience"),
                    item,
                    index,
                    "company_description",
                    f("companyDescription"),
                  )}
                  className="@lg/cv-form:col-span-2"
                >
                  <Textarea
                    rows={2}
                    value={item.company_description ?? ""}
                    disabled={disabled}
                    placeholder={p("companyDescription")}
                    onChange={(event) =>
                      update({ company_description: event.target.value })
                    }
                  />
                </CvField>
                <CvStringListField
                  label={f("highlights")}
                  marker={itemMarker(
                    "experience",
                    n("experience"),
                    item,
                    index,
                    "bullets",
                    f("highlights"),
                  )}
                  className="@lg/cv-form:col-span-2"
                  value={item.bullets}
                  disabled={disabled}
                  onChange={(bullets) => update({ bullets })}
                  addLabel={fields("addHighlight")}
                  noun={n("highlight")}
                  placeholder={p("highlight")}
                />
              </div>
            )}
          />
        )}
      />

      <Controller
        control={control}
        name="projects"
        render={({ field }) => (
          <CvRepeatableSection<CvProject>
            {...sectionProps("projects")}
            {...listDiff("projects")}
            title={t("projects.title")}
            description={t("projects.description")}
            icon={FolderGit2}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({
              id: newItemId(),
              name: "",
              description: "",
            })}
            itemLabel={(item) => item.name || t("projects.newItem")}
            addLabel={t("projects.add")}
            itemNoun={n("project")}
            emptyHint={t("projects.emptyHint")}
            disabled={disabled}
            renderItem={({ item, index, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField
                  label={f("name")}
                  marker={itemMarker(
                    "projects",
                    n("project"),
                    item,
                    index,
                    "name",
                    f("name"),
                  )}
                >
                  <Input
                    value={item.name}
                    disabled={disabled}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </CvField>
                <CvField
                  label={f("link")}
                  marker={itemMarker(
                    "projects",
                    n("project"),
                    item,
                    index,
                    "link",
                    f("link"),
                  )}
                >
                  <Input
                    value={item.link ?? ""}
                    disabled={disabled}
                    placeholder="https://…"
                    onChange={(event) => update({ link: event.target.value })}
                  />
                </CvField>
                <CvField
                  label={f("linkLabel")}
                  marker={itemMarker(
                    "projects",
                    n("project"),
                    item,
                    index,
                    "link_label",
                    f("linkLabel"),
                  )}
                >
                  <Input
                    value={item.link_label ?? ""}
                    disabled={disabled}
                    placeholder={p("linkLabel")}
                    onChange={(event) =>
                      update({ link_label: event.target.value })
                    }
                  />
                </CvField>
                <CvField
                  label={f("description")}
                  marker={itemMarker(
                    "projects",
                    n("project"),
                    item,
                    index,
                    "description",
                    f("description"),
                  )}
                  className="@lg/cv-form:col-span-2"
                >
                  <Textarea
                    rows={2}
                    value={item.description}
                    disabled={disabled}
                    onChange={(event) =>
                      update({ description: event.target.value })
                    }
                  />
                </CvField>
              </div>
            )}
          />
        )}
      />

      <Controller
        control={control}
        name="education"
        render={({ field }) => (
          <CvRepeatableSection<CvEducation>
            {...sectionProps("education")}
            {...listDiff("education")}
            title={t("education.title")}
            description={t("education.description")}
            icon={GraduationCap}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({
              id: newItemId(),
              institution: "",
              degree: "",
              start: "",
            })}
            itemLabel={(item) =>
              item.institution || item.degree || t("education.newItem")
            }
            addLabel={t("education.add")}
            itemNoun={n("education")}
            emptyHint={t("education.emptyHint")}
            disabled={disabled}
            renderItem={({ item, index, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField
                  label={f("institution")}
                  marker={itemMarker(
                    "education",
                    n("education"),
                    item,
                    index,
                    "institution",
                    f("institution"),
                  )}
                  className="@lg/cv-form:col-span-2"
                >
                  <Input
                    value={item.institution}
                    disabled={disabled}
                    placeholder={p("institution")}
                    onChange={(event) =>
                      update({ institution: event.target.value })
                    }
                  />
                </CvField>
                <CvField
                  label={f("degree")}
                  marker={itemMarker(
                    "education",
                    n("education"),
                    item,
                    index,
                    "degree",
                    f("degree"),
                  )}
                >
                  <Input
                    value={item.degree}
                    disabled={disabled}
                    placeholder={p("degree")}
                    onChange={(event) => update({ degree: event.target.value })}
                  />
                </CvField>
                <CvField
                  label={f("area")}
                  marker={itemMarker(
                    "education",
                    n("education"),
                    item,
                    index,
                    "area",
                    f("area"),
                  )}
                  hint={h("optional")}
                >
                  <Input
                    value={item.area ?? ""}
                    disabled={disabled}
                    placeholder={p("area")}
                    onChange={(event) => update({ area: event.target.value })}
                  />
                </CvField>
                {/* The same pair as an experience row, and required here too. */}
                <CvField
                  label={f("start")}
                  marker={itemMarker(
                    "education",
                    n("education"),
                    item,
                    index,
                    "start",
                    f("start"),
                  )}
                  required
                  hint={h("monthYear")}
                >
                  <MonthYearInput
                    value={item.start}
                    disabled={disabled}
                    aria-required
                    onChange={(start) => update({ start })}
                  />
                </CvField>
                <CvField
                  label={f("finish")}
                  marker={itemMarker(
                    "education",
                    n("education"),
                    item,
                    index,
                    "end",
                    f("finish"),
                  )}
                  hint={h("finishCourse")}
                >
                  <MonthYearInput
                    value={item.end ?? ""}
                    disabled={disabled}
                    onChange={(end) => update({ end })}
                  />
                </CvField>
              </div>
            )}
          />
        )}
      />

      <Controller
        control={control}
        name="certifications"
        render={({ field }) => (
          <CvRepeatableSection<CvCertification>
            {...sectionProps("certifications")}
            {...listDiff("certifications")}
            title={t("certifications.title")}
            description={t("certifications.description")}
            icon={Award}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({ id: newItemId(), name: "", issuer: "" })}
            itemLabel={(item) => item.name || t("certifications.newItem")}
            addLabel={t("certifications.add")}
            itemNoun={n("certification")}
            emptyHint={t("certifications.emptyHint")}
            disabled={disabled}
            renderItem={({ item, index, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField
                  label={f("name")}
                  marker={itemMarker(
                    "certifications",
                    n("certification"),
                    item,
                    index,
                    "name",
                    f("name"),
                  )}
                >
                  <Input
                    value={item.name}
                    disabled={disabled}
                    placeholder="AWS Solutions Architect"
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </CvField>
                <CvField
                  label={f("issuer")}
                  marker={itemMarker(
                    "certifications",
                    n("certification"),
                    item,
                    index,
                    "issuer",
                    f("issuer"),
                  )}
                >
                  <Input
                    value={item.issuer}
                    disabled={disabled}
                    placeholder="Amazon Web Services"
                    onChange={(event) => update({ issuer: event.target.value })}
                  />
                </CvField>
              </div>
            )}
          />
        )}
      />

      <Controller
        control={control}
        name="languages"
        render={({ field }) => (
          <CvRepeatableSection<CvLanguage>
            {...sectionProps("languages")}
            {...listDiff("languages")}
            title={t("languages.title")}
            description={t("languages.description")}
            icon={Languages}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({
              id: newItemId(),
              name: "",
              level: "Proficient",
            })}
            itemLabel={(item) => item.name || t("languages.newItem")}
            addLabel={t("languages.add")}
            itemNoun={n("language")}
            emptyHint={t("languages.emptyHint")}
            disabled={disabled}
            renderItem={({ item, index, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField
                  label={f("language")}
                  marker={itemMarker(
                    "languages",
                    n("language"),
                    item,
                    index,
                    "name",
                    f("language"),
                  )}
                >
                  <Input
                    value={item.name}
                    disabled={disabled}
                    placeholder={p("language")}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </CvField>
                <CvSelectField
                  label={f("level")}
                  marker={itemMarker(
                    "languages",
                    n("language"),
                    item,
                    index,
                    "level",
                    f("level"),
                  )}
                  value={item.level}
                  disabled={disabled}
                  options={CV_LANGUAGE_LEVELS}
                  optionLabel={(level) =>
                    fields(`languageLevel.${LANGUAGE_LEVEL_KEY[level]}`)
                  }
                  placeholder={p("level")}
                  onValueChange={(level) => update({ level })}
                />
              </div>
            )}
          />
        )}
      />
    </div>
  );
}
