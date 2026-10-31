"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";

import { FormSection } from "@/components/applications/form-section";
import {
  ModeType,
  WorkModeType,
  type Company,
} from "@/services/types/applications";
import {
  PlatformSelect,
  type NewPlatformInput,
  type PlatformCreateOutcome,
  type PlatformOption,
} from "@/components/applications/platform-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SelectOptions } from "@/options";
import {
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
} from "@/services/types/users";
import { CompanySelect } from "./company-select";
import { DatePickerInput } from "../ui/date-picker";

/** Server ceiling on `job_description`. The field is optional. */
export const JOB_DESCRIPTION_MAX = 50_000;

const ROW2 = "grid grid-cols-1 items-start gap-3 @md/app-form:grid-cols-2";
const ROW3 = "grid grid-cols-1 items-start gap-3 @md/app-form:grid-cols-3";

export function getCurrencySymbol(currency: string) {
  return (
    SelectOptions.CURRENCY.find((c) => c.value === currency)?.symbol ?? currency
  );
}

/**
 * The field set the application-with-CV draft page (KODI-033) and the side
 * sheet share. `application_date` is optional at this type level only —
 * both callers' own zod schemas require it (KODI-036, AC1/AC3): the sheet's
 * schema already did, and the draft page's schema now does too, since every
 * draft carries and autosaves an application date from step 1.
 */
export interface ApplicationFieldsValues {
  company?: string | { name?: string; url?: string } | undefined;
  platform_id: string;
  role: string;
  mode: ModeType;
  application_date?: string;
  link_to_job?: string;
  currency?: SalaryCurrencyType;
  salary_period?: SalaryPeriodType;
  expected_salary?: number;
  salary_range_min?: number;
  salary_range_max?: number;
  experience_level?: SeniorityLevelType;
  work_mode?: WorkModeType;
  country?: string;
  observation?: string;
  job_description?: string;
}

export interface ApplicationFieldsProps {
  form: UseFormReturn<ApplicationFieldsValues>;
  fetchCompanies: (query: string) => Promise<Company[]>;
  companySelectValue?: Company | null;
  platforms: readonly PlatformOption[] | undefined;
  platformsLoading?: boolean;
  onCreatePlatform: (input: NewPlatformInput) => Promise<PlatformCreateOutcome>;
  onCompanyChange?: (company: Company | null) => void;
  /** Root class. Neither caller puts a width limit of its own on it (AC5). */
  className?: string;
  /** `"h3"` in the Sheet (its title is already an `h2`); the page keeps `"h2"`. */
  sectionHeadingAs?: "h2" | "h3";
}

/**
 * Every field the side sheet asks for, minus the chrome (Sheet, header,
 * Cancel/submit) and the schema/submit wiring — both callers own those.
 * Grouped into three titled sections (KODI-035, T110): "Role & company" (what
 * every application needs), "Details" (optional work mode/pay) and "Posting &
 * notes" (the job posting and free-text notes).
 */
export function ApplicationFields({
  form,
  fetchCompanies,
  companySelectValue = null,
  platforms,
  platformsLoading = false,
  onCreatePlatform,
  onCompanyChange,
  className,
  sectionHeadingAs = "h3",
}: ApplicationFieldsProps) {
  const t = useTranslations("applications.fields");
  const roleId = useId();
  const jobDescriptionId = useId();
  const jobDescriptionHintId = useId();
  const platformFieldId = useId();
  const companyFieldId = useId();
  const jobLinkId = useId();
  const dateFieldId = useId();
  const workModeId = useId();
  const experienceLevelId = useId();
  const countryId = useId();
  const currencyId = useId();
  const salaryPeriodId = useId();
  const expectedSalaryId = useId();
  const minSalaryId = useId();
  const maxSalaryId = useId();
  const observationId = useId();
  const salaryHintId = useId();
  const companyErrorId = useId();
  const platformErrorId = useId();

  const watchCurrency = useWatch({ control: form.control, name: "currency" });
  const watchSalaryPeriod = useWatch({
    control: form.control,
    name: "salary_period",
  });
  const watchPlatformId = useWatch({
    control: form.control,
    name: "platform_id",
  });
  const watchMode = useWatch({ control: form.control, name: "mode" });
  const watchWorkMode = useWatch({
    control: form.control,
    name: "work_mode",
  });
  const watchExperienceLevel = useWatch({
    control: form.control,
    name: "experience_level",
  });
  const watchApplicationDate = useWatch({
    control: form.control,
    name: "application_date",
  });
  const salaryEnabled = !!watchCurrency && !!watchSalaryPeriod;
  const currencySymbol = watchCurrency ? getCurrencySymbol(watchCurrency) : "$";

  // `company` is a discriminated-union field (CompanySelect's `ZodType`):
  // the string branch's own error carries `{message}`, the free-text object
  // branch carries `{name: {message}}` (empty name) or `{url: {message}}`
  // (bad URL) — show whichever is present.
  type CompanyFieldError = {
    message?: string;
    name?: { message?: string };
    url?: { message?: string };
  };
  const companyErrors = form.formState.errors.company as
    | CompanyFieldError
    | undefined;
  const companyError =
    companyErrors?.message ??
    companyErrors?.name?.message ??
    companyErrors?.url?.message;

  return (
    <div
      data-slot="application-fields"
      className={cn(
        "@container/app-form flex min-w-0 flex-col gap-5",
        className,
      )}
    >
      <FormSection
        as={sectionHeadingAs}
        title={t("roleSection")}
        description={t("roleSectionHint")}
      >
        <div className={ROW2}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={roleId}>
              {t("role")}
              <span aria-hidden="true">*</span>
            </Label>
            <Input
              id={roleId}
              {...form.register("role")}
              placeholder={t("rolePlaceholder")}
              aria-required={true}
              aria-invalid={form.formState.errors.role ? true : undefined}
              aria-describedby={
                form.formState.errors.role ? `${roleId}-error` : undefined
              }
              className={cn(
                form.formState.errors.role &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {form.formState.errors.role && (
              <p id={`${roleId}-error`} className="text-xs text-destructive">
                {form.formState.errors.role.message}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="application-fields-source">
              {t("source")}
              <span aria-hidden="true">*</span>
            </Label>
            <Select
              value={watchMode}
              onValueChange={(v) =>
                form.setValue("mode", v as ModeType, { shouldValidate: true })
              }
            >
              <SelectTrigger
                id="application-fields-source"
                aria-label={t("source")}
                aria-required={true}
                className={cn(
                  form.formState.errors.mode &&
                    "border-destructive focus:ring-destructive",
                )}
              >
                <SelectValue placeholder={t("select")} />
              </SelectTrigger>
              <SelectContent>
                {SelectOptions.SOURCE.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.mode && (
              <p className="text-xs text-destructive">
                {form.formState.errors.mode.message}
              </p>
            )}
          </div>
        </div>

        <div className={ROW2}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={companyFieldId}>
              {t("company")}
              <span aria-hidden="true">*</span>
            </Label>
            <CompanySelect
              id={companyFieldId}
              value={companySelectValue}
              form={form}
              fetchCompanies={fetchCompanies}
              onCompanyChange={onCompanyChange}
              aria-invalid={companyError ? true : undefined}
              aria-describedby={companyError ? companyErrorId : undefined}
              aria-required={true}
            />
            {companyError && (
              <p id={companyErrorId} className="text-xs text-destructive">
                {companyError}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={platformFieldId}>
              {t("platform")}
              <span aria-hidden="true">*</span>
            </Label>
            <PlatformSelect
              id={platformFieldId}
              options={platforms}
              isLoading={platformsLoading}
              value={String(watchPlatformId || "")}
              onValueChange={(v) => {
                form.setValue("platform_id", v as never, {
                  shouldValidate: true,
                });
              }}
              onCreate={onCreatePlatform}
              aria-invalid={
                form.formState.errors.platform_id ? true : undefined
              }
              aria-describedby={
                form.formState.errors.platform_id ? platformErrorId : undefined
              }
              aria-required={true}
            />
            {form.formState.errors.platform_id && (
              <p id={platformErrorId} className="text-xs text-destructive">
                {form.formState.errors.platform_id.message}
              </p>
            )}
          </div>
        </div>

        <div className={ROW2}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={dateFieldId}>
              {t("applicationDate")}
              <span aria-hidden="true">*</span>
            </Label>
            <DatePickerInput
              id={dateFieldId}
              value={watchApplicationDate}
              onChange={(date) =>
                form.setValue(
                  "application_date" as never,
                  (date ?? "") as never,
                  { shouldValidate: true },
                )
              }
              maxDate={new Date()}
              className={cn(
                form.formState.errors.application_date &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {form.formState.errors.application_date && (
              <p className="text-xs text-destructive">
                {form.formState.errors.application_date.message}
              </p>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={jobLinkId}>{t("jobLink")}</Label>
            <Input
              id={jobLinkId}
              inputMode="url"
              {...form.register("link_to_job")}
              placeholder="https://www.linkedin.com/jobs/..."
              aria-invalid={
                form.formState.errors.link_to_job ? true : undefined
              }
              aria-describedby={
                form.formState.errors.link_to_job
                  ? `${jobLinkId}-error`
                  : undefined
              }
              className={cn(
                form.formState.errors.link_to_job &&
                  "border-destructive focus-visible:ring-destructive",
              )}
            />
            {form.formState.errors.link_to_job && (
              <p id={`${jobLinkId}-error`} className="text-xs text-destructive">
                {form.formState.errors.link_to_job.message}
              </p>
            )}
          </div>
        </div>
      </FormSection>

      <FormSection
        as={sectionHeadingAs}
        title={t("detailsSection")}
        description={t("detailsSectionHint")}
      >
        <div className={ROW3}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={workModeId}>{t("workMode")}</Label>
            <Select
              value={watchWorkMode}
              onValueChange={(v) =>
                form.setValue("work_mode", v as WorkModeType, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id={workModeId}>
                <SelectValue placeholder={t("select")} />
              </SelectTrigger>
              <SelectContent>
                {SelectOptions.WORK_MODE.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={experienceLevelId}>{t("experienceLevel")}</Label>
            <Select
              value={watchExperienceLevel}
              onValueChange={(v) =>
                form.setValue("experience_level", v as SeniorityLevelType, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id={experienceLevelId}>
                <SelectValue placeholder={t("select")} />
              </SelectTrigger>
              <SelectContent>
                {SelectOptions.SENIORITY.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={countryId}>{t("country")}</Label>
            <Input
              id={countryId}
              autoComplete="country-name"
              {...form.register("country")}
              placeholder={t("countryPlaceholder")}
            />
          </div>
        </div>

        <div className={ROW2}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={currencyId}>{t("currency")}</Label>
            <Select
              value={watchCurrency}
              onValueChange={(v) => {
                form.setValue("currency", v as SalaryCurrencyType, {
                  shouldValidate: true,
                });
              }}
            >
              <SelectTrigger
                id={currencyId}
                className={cn(
                  form.formState.errors.currency &&
                    "border-destructive focus:ring-destructive",
                )}
              >
                <SelectValue placeholder={t("select")} />
              </SelectTrigger>
              <SelectContent>
                {SelectOptions.CURRENCY.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.symbol} — {c.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.currency && (
              <p className="text-xs text-destructive">
                {form.formState.errors.currency.message}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={salaryPeriodId}>{t("salaryPeriod")}</Label>
            <Select
              value={watchSalaryPeriod}
              onValueChange={(v) => {
                form.setValue("salary_period", v as SalaryPeriodType, {
                  shouldValidate: true,
                });
              }}
            >
              <SelectTrigger
                id={salaryPeriodId}
                className={cn(
                  form.formState.errors.salary_period &&
                    "border-destructive focus:ring-destructive",
                )}
              >
                <SelectValue placeholder={t("select")} />
              </SelectTrigger>
              <SelectContent>
                {SelectOptions.SALARY_PERIOD.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.salary_period && (
              <p className="text-xs text-destructive">
                {form.formState.errors.salary_period.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className={cn(ROW3, !salaryEnabled && "opacity-50")}>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={expectedSalaryId}>{t("expected")}</Label>
              <div className="relative">
                <span
                  className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground"
                  aria-hidden
                >
                  {currencySymbol}
                </span>
                <Input
                  id={expectedSalaryId}
                  type="number"
                  disabled={!salaryEnabled}
                  aria-describedby={!salaryEnabled ? salaryHintId : undefined}
                  {...form.register("expected_salary", {
                    valueAsNumber: true,
                  })}
                  className="pl-8"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={minSalaryId}>{t("min")}</Label>
              <div className="relative">
                <span
                  className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground"
                  aria-hidden
                >
                  {currencySymbol}
                </span>
                <Input
                  id={minSalaryId}
                  type="number"
                  disabled={!salaryEnabled}
                  aria-describedby={!salaryEnabled ? salaryHintId : undefined}
                  {...form.register("salary_range_min", {
                    valueAsNumber: true,
                  })}
                  className="pl-8"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={maxSalaryId}>{t("max")}</Label>
              <div className="relative">
                <span
                  className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground"
                  aria-hidden
                >
                  {currencySymbol}
                </span>
                <Input
                  id={maxSalaryId}
                  type="number"
                  disabled={!salaryEnabled}
                  aria-describedby={!salaryEnabled ? salaryHintId : undefined}
                  {...form.register("salary_range_max", {
                    valueAsNumber: true,
                  })}
                  className="pl-8"
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          {!salaryEnabled ? (
            <p id={salaryHintId} className="text-xs text-muted-foreground">
              {t("salaryHint")}
            </p>
          ) : null}
        </div>
      </FormSection>

      <FormSection
        as={sectionHeadingAs}
        title={t("postingSection")}
        description={t("postingSectionHint")}
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={jobDescriptionId}>{t("jobDescription")}</Label>
          <Textarea
            id={jobDescriptionId}
            {...form.register("job_description")}
            placeholder={t("jobDescriptionPlaceholder")}
            rows={6}
            aria-invalid={
              form.formState.errors.job_description ? true : undefined
            }
            aria-describedby={
              form.formState.errors.job_description
                ? `${jobDescriptionId}-error`
                : jobDescriptionHintId
            }
            className={cn(
              form.formState.errors.job_description &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
          {form.formState.errors.job_description ? (
            <p
              id={`${jobDescriptionId}-error`}
              className="text-xs text-destructive"
            >
              {form.formState.errors.job_description.message}
            </p>
          ) : (
            <p
              id={jobDescriptionHintId}
              className="text-xs text-muted-foreground"
            >
              {t("jobDescriptionHint")}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={observationId}>{t("notes")}</Label>
          <Textarea
            id={observationId}
            {...form.register("observation")}
            placeholder={t("notesPlaceholder")}
            rows={3}
          />
        </div>
      </FormSection>
    </div>
  );
}
