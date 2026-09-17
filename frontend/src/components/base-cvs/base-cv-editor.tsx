"use client";

import type { FormEventHandler, ReactNode } from "react";
import { Controller, useFormState, useWatch } from "react-hook-form";
import type { FieldPath, UseFormReturn } from "react-hook-form";
import {
  Award,
  BadgeCheck,
  Briefcase,
  FolderGit2,
  Languages,
  Link2,
  Loader2,
  ScrollText,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CvField,
  CvSelectField,
  CvStringListField,
} from "@/components/base-cvs/cv-editor-fields";
import { CvRepeatableSection } from "@/components/base-cvs/cv-repeatable-section";
import { CvSectionCard } from "@/components/base-cvs/cv-section-card";
import { CvSkillsInput } from "@/components/base-cvs/cv-skills-input";
import { CvDocumentPreview } from "@/components/base-cvs/cv-document-preview";
import type { CvDocumentData } from "@/components/base-cvs/cv-document";
import {
  CV_LANGUAGE_LEVELS,
  type CvCertification,
  type CvExperience,
  type CvFormValues,
  type CvLanguage,
  type CvLink,
  type CvProject,
} from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

/** Client-generated id for a new section row. */
function defaultNewItemId(): string {
  // jsdom and insecure origins have no crypto.randomUUID.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `cv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface BaseCvEditorProps {
  /** The react-hook-form instance. The caller owns the schema and the defaults. */
  form: UseFormReturn<CvFormValues>;
  /** Usually `form.handleSubmit(onValid, onInvalid)`. */
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Visible text and accessible name of the submit button. */
  submitLabel?: string;
  /** Renders a Cancel button when given. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Disables every control and puts a spinner on submit. */
  isSubmitting?: boolean;
  /** Extra footer controls, left-aligned (the seam for a later export action). */
  actions?: ReactNode;
  /** Overrides id generation for new rows. Defaults to `crypto.randomUUID()`. */
  newItemId?: () => string;
  className?: string;
}

/**
 * The master CV form body, shared by the create and the edit route. Renders the
 * identity block, the summary, the skills chips and the five repeatable
 * sections, with a live document preview beside the form at `md` and up and
 * below it on narrow screens.
 *
 * Controlled and presentational: it neither owns the schema nor fetches nor
 * submits. Hand it a `form` and an `onSubmit`; it renders the fields, the
 * inline errors that `form` already holds and the submit/cancel footer.
 */
export function BaseCvEditor({
  form,
  onSubmit,
  submitLabel = "Save CV",
  onCancel,
  cancelLabel = "Cancel",
  isSubmitting = false,
  actions,
  newItemId = defaultNewItemId,
  className,
}: BaseCvEditorProps) {
  const { control, register } = form;
  const { errors } = useFormState({ control });
  // useWatch types every nested field as optional; the resolver guarantees the shape.
  const watched = useWatch({ control }) as Partial<CvFormValues>;

  const errorFor = (field: FieldPath<CvFormValues>): string | undefined => {
    const message = errors[field as keyof typeof errors]?.message;
    return typeof message === "string" ? message : undefined;
  };

  const previewCv: CvDocumentData = {
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
    certifications: watched.certifications ?? [],
    languages: watched.languages ?? [],
  };

  const errorId = (field: FieldPath<CvFormValues>) => `cv-${field}-error`;

  const invalid = (field: FieldPath<CvFormValues>) =>
    cn(errorFor(field) && "border-destructive focus-visible:ring-destructive");

  return (
    <form onSubmit={onSubmit} className={cn("space-y-6", className)} noValidate>
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <div className="@container/cv-form min-w-0 space-y-4">
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
                  disabled={isSubmitting}
                  placeholder="Backend-focused CV"
                  aria-invalid={errorFor("name") ? true : undefined}
                  aria-describedby={
                    errorFor("name") ? errorId("name") : undefined
                  }
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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
                disabled={isSubmitting}
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
                disabled={isSubmitting}
                renderItem={({ item, update }) => (
                  <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                    <CvField label="Label">
                      <Input
                        value={item.label}
                        disabled={isSubmitting}
                        placeholder="GitHub"
                        onChange={(event) =>
                          update({ label: event.target.value })
                        }
                      />
                    </CvField>
                    <CvField label="URL">
                      <Input
                        value={item.url}
                        disabled={isSubmitting}
                        placeholder="https://github.com/ada"
                        onChange={(event) =>
                          update({ url: event.target.value })
                        }
                      />
                    </CvField>
                  </div>
                )}
              />
            )}
          />

          <CvSectionCard
            title="Skills"
            description="The skills you want to feature. Press Enter to add one."
            icon={BadgeCheck}
          >
            <Controller
              control={control}
              name="skills"
              render={({ field }) => (
                <CvSkillsInput
                  value={field.value ?? []}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                  aria-invalid={errorFor("skills") ? true : undefined}
                  aria-describedby={
                    errorFor("skills") ? errorId("skills") : undefined
                  }
                />
              )}
            />
            {errorFor("skills") ? (
              <p
                id={errorId("skills")}
                className="mt-1.5 text-xs text-destructive"
              >
                {errorFor("skills")}
              </p>
            ) : null}
          </CvSectionCard>

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
                disabled={isSubmitting}
                renderItem={({ item, update }) => (
                  <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                    <CvField label="Company">
                      <Input
                        value={item.company}
                        disabled={isSubmitting}
                        placeholder="Stripe"
                        onChange={(event) =>
                          update({ company: event.target.value })
                        }
                      />
                    </CvField>
                    <CvField label="Role">
                      <Input
                        value={item.role}
                        disabled={isSubmitting}
                        placeholder="Senior Backend Engineer"
                        onChange={(event) =>
                          update({ role: event.target.value })
                        }
                      />
                    </CvField>
                    <CvField label="Period">
                      <Input
                        value={item.period}
                        disabled={isSubmitting}
                        placeholder="2021 — Present"
                        onChange={(event) =>
                          update({ period: event.target.value })
                        }
                      />
                    </CvField>
                    <CvField label="Location">
                      <Input
                        value={item.location ?? ""}
                        disabled={isSubmitting}
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
                        disabled={isSubmitting}
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
                      disabled={isSubmitting}
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
                disabled={isSubmitting}
                renderItem={({ item, update }) => (
                  <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                    <CvField label="Name">
                      <Input
                        value={item.name}
                        disabled={isSubmitting}
                        onChange={(event) =>
                          update({ name: event.target.value })
                        }
                      />
                    </CvField>
                    <CvField label="Link">
                      <Input
                        value={item.link ?? ""}
                        disabled={isSubmitting}
                        placeholder="https://…"
                        onChange={(event) =>
                          update({ link: event.target.value })
                        }
                      />
                    </CvField>
                    <CvField label="Link label">
                      <Input
                        value={item.link_label ?? ""}
                        disabled={isSubmitting}
                        placeholder="Live demo"
                        onChange={(event) =>
                          update({ link_label: event.target.value })
                        }
                      />
                    </CvField>
                    <CvField
                      label="Description"
                      className="@lg/cv-form:col-span-2"
                    >
                      <Textarea
                        rows={2}
                        value={item.description}
                        disabled={isSubmitting}
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
                disabled={isSubmitting}
                renderItem={({ item, update }) => (
                  <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                    <CvField label="Name">
                      <Input
                        value={item.name}
                        disabled={isSubmitting}
                        placeholder="AWS Solutions Architect"
                        onChange={(event) =>
                          update({ name: event.target.value })
                        }
                      />
                    </CvField>
                    <CvField label="Issuer">
                      <Input
                        value={item.issuer}
                        disabled={isSubmitting}
                        placeholder="Amazon Web Services"
                        onChange={(event) =>
                          update({ issuer: event.target.value })
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
                disabled={isSubmitting}
                renderItem={({ item, update }) => (
                  <div className="grid gap-3 @lg/cv-form:grid-cols-2">
                    <CvField label="Language">
                      <Input
                        value={item.name}
                        disabled={isSubmitting}
                        placeholder="English"
                        onChange={(event) =>
                          update({ name: event.target.value })
                        }
                      />
                    </CvField>
                    <CvSelectField
                      label="Level"
                      value={item.level}
                      disabled={isSubmitting}
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

        <aside
          aria-label="CV preview"
          className="min-w-0 space-y-2 md:sticky md:top-20"
        >
          <p className="text-xs font-medium tracking-wide-label text-muted-foreground uppercase">
            Live preview
          </p>
          <CvDocumentPreview cv={previewCv} />
        </aside>
      </div>

      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/85 py-3 backdrop-blur">
        {actions ? (
          <div className="mr-auto flex items-center gap-2">{actions}</div>
        ) : null}
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
