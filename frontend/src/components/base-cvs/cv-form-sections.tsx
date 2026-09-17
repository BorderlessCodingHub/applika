"use client";

import { Controller, useFormState, useWatch } from "react-hook-form";
import type { Control, FieldPath, UseFormReturn } from "react-hook-form";
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

export interface CvFormSectionsProps {
  /** The react-hook-form instance. The caller owns the schema and the defaults. */
  form: UseFormReturn<CvFormValues>;
  /** Disables every control — while saving, and in a read-only editor. */
  disabled?: boolean;
  /** Mints ids for new section rows. Defaults to `crypto.randomUUID()`. */
  newItemId?: () => string;
  className?: string;
}

/**
 * The CV field body: identity and contact, summary, links, skills, experience,
 * projects, education, certifications and languages, in that order, with the
 * inline errors the form already holds.
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
  className,
}: CvFormSectionsProps) {
  const { control, register } = form;
  const { errors } = useFormState({ control });

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

      <CvSectionCard
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
        name="links"
        render={({ field }) => (
          <CvRepeatableSection<CvLink>
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

      <Controller
        control={control}
        name="skills"
        render={({ field }) => (
          <CvSkillsSection
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
            title="Experience"
            description="Your roles, most recent first."
            icon={Briefcase}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({
              id: newItemId(),
              company: "",
              role: "",
              period: "",
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
                <CvField label="Period">
                  <Input
                    value={item.period}
                    disabled={disabled}
                    placeholder="2021 — Present"
                    onChange={(event) => update({ period: event.target.value })}
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
            title="Education"
            description="Degrees and diplomas, most recent first."
            icon={GraduationCap}
            items={field.value ?? []}
            onChange={field.onChange}
            createItem={() => ({
              id: newItemId(),
              institution: "",
              degree: "",
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
                <CvField
                  label="Period"
                  hint="Optional. Free text — it prints exactly as you write it."
                  className="@lg/cv-form:col-span-2"
                >
                  <Input
                    value={item.period ?? ""}
                    disabled={disabled}
                    placeholder="2014 — 2018"
                    onChange={(event) => update({ period: event.target.value })}
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
