"use client";

import { useMemo, useState } from "react";
import { Controller, useFormState, useWatch } from "react-hook-form";
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
  CV_LANGUAGE_LEVELS,
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
  className,
}: CvFormSectionsProps) {
  const { control, register } = form;
  const { errors, submitCount } = useFormState({ control });

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

  return (
    <div className={cn("@container/cv-form min-w-0 space-y-4", className)}>
      <CvSectionCard
        {...sectionProps("identity")}
        title="Identity and contact"
        description="The header at the top of your CV, plus the label you recognise this CV by."
        icon={UserRound}
      >
        <div className="grid gap-4 @lg/cv-form:grid-cols-2">
          <CvField
            label="CV label"
            required
            error={errorFor("name")}
            errorId={errorId("name")}
            hint="Only you see this. It names the CV in your list."
            className="@lg/cv-form:col-span-2"
          >
            <Input
              {...register("name")}
              disabled={disabled}
              placeholder="Backend-focused CV"
              aria-invalid={errorFor("name") ? true : undefined}
              aria-describedby={errorFor("name") ? errorId("name") : undefined}
              className={invalid("name")}
            />
          </CvField>
          <CvField
            label="Full name"
            required
            error={errorFor("full_name")}
            errorId={errorId("full_name")}
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
            label="Headline"
            required
            error={errorFor("headline")}
            errorId={errorId("headline")}
          >
            <Input
              {...register("headline")}
              disabled={disabled}
              placeholder="Senior Software Engineer"
              aria-invalid={errorFor("headline") ? true : undefined}
              aria-describedby={
                errorFor("headline") ? errorId("headline") : undefined
              }
              className={invalid("headline")}
            />
          </CvField>
          <CvField
            label="Email"
            required
            error={errorFor("email")}
            errorId={errorId("email")}
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
            label="Phone"
            error={errorFor("phone")}
            errorId={errorId("phone")}
            hint="Optional."
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
            label="Location"
            required
            error={errorFor("location")}
            errorId={errorId("location")}
            className="@lg/cv-form:col-span-2"
          >
            <Input
              {...register("location")}
              disabled={disabled}
              placeholder="London, United Kingdom"
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
            title="Links"
            description="Portfolio, GitHub, LinkedIn and other profiles."
            icon={Link2}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({ id: newItemId(), label: "", url: "" })}
            itemLabel={(item) => item.label || "New link"}
            addLabel="Add link"
            itemNoun="link"
            emptyHint="No links yet. Add the profiles you want on your CV."
            disabled={disabled}
            renderItem={({ item, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField label="Label">
                  <Input
                    value={item.label}
                    disabled={disabled}
                    placeholder="GitHub"
                    onChange={(event) => update({ label: event.target.value })}
                  />
                </CvField>
                <CvField label="URL">
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
        title="Summary"
        description="A short professional summary, in your own words."
        icon={ScrollText}
      >
        <CvField
          label="Summary"
          required
          error={errorFor("summary")}
          errorId={errorId("summary")}
        >
          <Textarea
            {...register("summary")}
            rows={5}
            disabled={disabled}
            placeholder="Backend engineer with eight years on payment systems…"
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
            collapsibleItems
            revealItemIds={revealExperienceRows(field.value)}
            revealNonce={submitCount}
            title="Experience"
            description="Your roles, most recent first."
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
            itemLabel={(item) => item.role || item.company || "New role"}
            addLabel="Add experience"
            itemNoun="experience"
            emptyHint="No roles yet. Add the jobs you want on this CV."
            disabled={disabled}
            renderItem={({ item, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField label="Company">
                  <Input
                    value={item.company}
                    disabled={disabled}
                    placeholder="Stripe"
                    onChange={(event) =>
                      update({ company: event.target.value })
                    }
                  />
                </CvField>
                <CvField label="Role">
                  <Input
                    value={item.role}
                    disabled={disabled}
                    placeholder="Senior Backend Engineer"
                    onChange={(event) => update({ role: event.target.value })}
                  />
                </CvField>
                {/*
                  Company -> role -> WHEN -> where. Start and Finish share a
                  row at `@lg/cv-form` and stack below it; the label is exactly
                  `Start`/`Finish` in both sections, disambiguated by the row's
                  own `role="group"` name, never qualified further.
                */}
                <CvField label="Start" required hint="Month and year, MM/yyyy.">
                  <MonthYearInput
                    value={item.start}
                    disabled={disabled}
                    aria-required
                    onChange={(start) => update({ start })}
                  />
                </CvField>
                <CvField
                  label="Finish"
                  hint="Optional. Leave it empty for a role you are still in — it prints as present."
                >
                  <MonthYearInput
                    value={item.end ?? ""}
                    disabled={disabled}
                    onChange={(end) => update({ end })}
                  />
                </CvField>
                <CvField label="Location">
                  <Input
                    value={item.location ?? ""}
                    disabled={disabled}
                    placeholder="Remote"
                    onChange={(event) =>
                      update({ location: event.target.value })
                    }
                  />
                </CvField>
                <CvField
                  label="Company description"
                  className="@lg/cv-form:col-span-2"
                >
                  <Textarea
                    rows={2}
                    value={item.company_description ?? ""}
                    disabled={disabled}
                    placeholder="Payments infrastructure, 8000 people."
                    onChange={(event) =>
                      update({ company_description: event.target.value })
                    }
                  />
                </CvField>
                <CvStringListField
                  label="Highlights"
                  className="@lg/cv-form:col-span-2"
                  value={item.bullets}
                  disabled={disabled}
                  onChange={(bullets) => update({ bullets })}
                  addLabel="Add highlight"
                  noun="highlight"
                  placeholder="Cut settlement latency by 40%…"
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
            title="Projects"
            description="Side projects, open source and notable work."
            icon={FolderGit2}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({
              id: newItemId(),
              name: "",
              description: "",
            })}
            itemLabel={(item) => item.name || "New project"}
            addLabel="Add project"
            itemNoun="project"
            emptyHint="No projects yet."
            disabled={disabled}
            renderItem={({ item, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField label="Name">
                  <Input
                    value={item.name}
                    disabled={disabled}
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </CvField>
                <CvField label="Link">
                  <Input
                    value={item.link ?? ""}
                    disabled={disabled}
                    placeholder="https://…"
                    onChange={(event) => update({ link: event.target.value })}
                  />
                </CvField>
                <CvField label="Link label">
                  <Input
                    value={item.link_label ?? ""}
                    disabled={disabled}
                    placeholder="Live demo"
                    onChange={(event) =>
                      update({ link_label: event.target.value })
                    }
                  />
                </CvField>
                <CvField label="Description" className="@lg/cv-form:col-span-2">
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
            title="Education"
            description="Degrees and diplomas, most recent first."
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
              item.institution || item.degree || "New qualification"
            }
            addLabel="Add education"
            itemNoun="education"
            emptyHint="No education yet. Add the degrees you want on this CV."
            disabled={disabled}
            renderItem={({ item, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField label="Institution" className="@lg/cv-form:col-span-2">
                  <Input
                    value={item.institution}
                    disabled={disabled}
                    placeholder="University of Edinburgh"
                    onChange={(event) =>
                      update({ institution: event.target.value })
                    }
                  />
                </CvField>
                <CvField label="Degree">
                  <Input
                    value={item.degree}
                    disabled={disabled}
                    placeholder="BSc"
                    onChange={(event) => update({ degree: event.target.value })}
                  />
                </CvField>
                <CvField label="Field of study" hint="Optional.">
                  <Input
                    value={item.area ?? ""}
                    disabled={disabled}
                    placeholder="Computer Science"
                    onChange={(event) => update({ area: event.target.value })}
                  />
                </CvField>
                {/* The same pair as an experience row, and required here too. */}
                <CvField label="Start" required hint="Month and year, MM/yyyy.">
                  <MonthYearInput
                    value={item.start}
                    disabled={disabled}
                    aria-required
                    onChange={(start) => update({ start })}
                  />
                </CvField>
                <CvField
                  label="Finish"
                  hint="Optional. Leave it empty for a course you are still on — it prints as present."
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
            title="Certifications"
            description="Professional certifications and licences."
            icon={Award}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({ id: newItemId(), name: "", issuer: "" })}
            itemLabel={(item) => item.name || "New certification"}
            addLabel="Add certification"
            itemNoun="certification"
            emptyHint="No certifications yet."
            disabled={disabled}
            renderItem={({ item, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField label="Name">
                  <Input
                    value={item.name}
                    disabled={disabled}
                    placeholder="AWS Solutions Architect"
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </CvField>
                <CvField label="Issuer">
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
            title="Languages"
            description="The languages you speak and how well."
            icon={Languages}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({
              id: newItemId(),
              name: "",
              level: "Proficient",
            })}
            itemLabel={(item) => item.name || "New language"}
            addLabel="Add language"
            itemNoun="language"
            emptyHint="No languages yet."
            disabled={disabled}
            renderItem={({ item, update }) => (
              <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                <CvField label="Language">
                  <Input
                    value={item.name}
                    disabled={disabled}
                    placeholder="English"
                    onChange={(event) => update({ name: event.target.value })}
                  />
                </CvField>
                <CvSelectField
                  label="Level"
                  value={item.level}
                  disabled={disabled}
                  options={CV_LANGUAGE_LEVELS}
                  placeholder="Pick a level"
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
