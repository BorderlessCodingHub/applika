"use client";

import { useId } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
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

export function getCurrencySymbol(currency: string) {
  return (
    SelectOptions.CURRENCY.find((c) => c.value === currency)?.symbol ?? currency
  );
}

/**
 * The field set the application-with-CV draft page (KODI-033) and the side
 * sheet share. `application_date` is optional here on purpose: the sheet's own
 * schema still requires it (unaffected by this extraction), while the draft
 * page never renders the field at all (AC3) and its own schema never asks.
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
  /** `false` on the new-with-cv draft page: no application-date question (AC3). */
  showDate?: boolean;
  onCompanyChange?: (company: Company | null) => void;
  /**
   * Fired when the Company URL input loses focus. The draft page uses this to
   * gate a brand-new company's `POST /companies` on the user actually
   * FINISHING the URL, rather than on every autosave tick while they are
   * still typing it (KODI-033 QA round 1, B4).
   */
  onCompanyUrlBlur?: () => void;
}

/**
 * Every field the side sheet asks for, minus the chrome (Sheet, header,
 * Cancel/submit) and the schema/submit wiring — both callers own those. It is
 * a straight extraction from `application-form-sheet.tsx` (KODI-033, T065)
 * plus two additions: `showDate`, and the platform `<Select>` replaced by
 * `PlatformSelect` (T081) so a user can add an unlisted platform inline
 * (AC14), the same way `CompanySelect` already lets them add a company.
 */
export function ApplicationFields({
  form,
  fetchCompanies,
  companySelectValue = null,
  platforms,
  platformsLoading = false,
  onCreatePlatform,
  showDate = true,
  onCompanyChange,
  onCompanyUrlBlur,
}: ApplicationFieldsProps) {
  const jobDescriptionId = useId();
  const platformFieldId = useId();

  // Watch only company.name — avoids re-renders when company.url is typed into
  const companyName = useWatch({
    control: form.control,
    name: "company.name" as never,
  }) as string | undefined;
  const isCompanyObject = companyName !== undefined;

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
  const salaryEnabled = !!watchCurrency && !!watchSalaryPeriod;
  const currencySymbol = watchCurrency ? getCurrencySymbol(watchCurrency) : "$";

  const companyUrlInputError = (() => {
    if (!isCompanyObject) return undefined;
    type CmpUrlError = undefined | { url?: { message?: string } };
    const cmpErr = form.formState.errors.company as CmpUrlError;
    return cmpErr?.url;
  })();

  return (
    <div className="space-y-4">
      <CompanySelect
        value={companySelectValue}
        form={form}
        fetchCompanies={fetchCompanies}
        onCompanyChange={onCompanyChange}
      />
      {isCompanyObject && (
        <div className="space-y-1.5">
          <Label>Company URL</Label>
          <Input
            {...form.register("company.url" as never, {
              onBlur: () => onCompanyUrlBlur?.(),
            })}
            placeholder="https://company.com"
            className={cn(
              companyUrlInputError &&
                "border-destructive focus-visible:ring-destructive",
            )}
          />
          {companyUrlInputError && (
            <p className="text-xs text-destructive">
              {companyUrlInputError.message}
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Role *</Label>
        <Input
          {...form.register("role")}
          placeholder="e.g. Senior Engineer"
          className={cn(
            form.formState.errors.role &&
              "border-destructive focus-visible:ring-destructive",
          )}
        />
        {form.formState.errors.role && (
          <p className="text-xs text-destructive">
            {form.formState.errors.role.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={platformFieldId}>Platform *</Label>
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
            aria-invalid={form.formState.errors.platform_id ? true : undefined}
          />
          {form.formState.errors.platform_id && (
            <p className="text-xs text-destructive">
              {form.formState.errors.platform_id.message}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Source *</Label>
          <Select
            value={watchMode}
            onValueChange={(v) =>
              form.setValue("mode", v as ModeType, { shouldValidate: true })
            }
          >
            <SelectTrigger
              aria-label="Source"
              className={cn(
                form.formState.errors.mode &&
                  "border-destructive focus:ring-destructive",
              )}
            >
              <SelectValue placeholder="Select" />
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

      <div
        className={cn("grid gap-3", showDate ? "grid-cols-2" : "grid-cols-1")}
      >
        {showDate && (
          <div className="space-y-1.5">
            <Label>Application Date *</Label>
            <DatePickerInput
              value={(form.watch as (name: string) => string | undefined)(
                "application_date",
              )}
              onChange={(date) =>
                (
                  form.setValue as (
                    name: string,
                    value: string,
                    options?: { shouldValidate: boolean },
                  ) => void
                )("application_date", date ?? "", { shouldValidate: true })
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
        )}

        <div className="space-y-1.5">
          <Label>Work Mode</Label>
          <Select
            value={watchWorkMode}
            onValueChange={(v) =>
              form.setValue("work_mode", v as WorkModeType, {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
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
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Experience Level</Label>
          <Select
            value={watchExperienceLevel}
            onValueChange={(v) =>
              form.setValue("experience_level", v as SeniorityLevelType, {
                shouldValidate: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select" />
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

        <div className="space-y-1.5">
          <Label>Country</Label>
          <Input {...form.register("country")} placeholder="e.g. Brazil" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Job Link</Label>
        <Input
          {...form.register("link_to_job")}
          placeholder="https://www.linkedin.com/jobs/..."
          className={cn(
            form.formState.errors.link_to_job &&
              "border-destructive focus-visible:ring-destructive",
          )}
        />
        {form.formState.errors.link_to_job && (
          <p className="text-xs text-destructive">
            {form.formState.errors.link_to_job.message}
          </p>
        )}
      </div>

      {/* Salary section */}
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select
              value={watchCurrency}
              onValueChange={(v) => {
                form.setValue("currency", v as SalaryCurrencyType, {
                  shouldValidate: true,
                });
              }}
            >
              <SelectTrigger
                className={cn(
                  form.formState.errors.currency &&
                    "border-destructive focus:ring-destructive",
                )}
              >
                <SelectValue placeholder="Select" />
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
          <div className="space-y-1.5">
            <Label>Salary Period</Label>
            <Select
              value={watchSalaryPeriod}
              onValueChange={(v) => {
                form.setValue("salary_period", v as SalaryPeriodType, {
                  shouldValidate: true,
                });
              }}
            >
              <SelectTrigger
                className={cn(
                  form.formState.errors.salary_period &&
                    "border-destructive focus:ring-destructive",
                )}
              >
                <SelectValue placeholder="Select" />
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
        <div
          className={cn(
            "grid grid-cols-3 gap-3",
            !salaryEnabled && "opacity-50",
          )}
        >
          <div className="space-y-1.5">
            <Label>Expected</Label>
            <div className="relative">
              <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                type="number"
                disabled={!salaryEnabled}
                {...form.register("expected_salary", {
                  valueAsNumber: true,
                })}
                className="pl-8"
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Min</Label>
            <div className="relative">
              <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                type="number"
                disabled={!salaryEnabled}
                {...form.register("salary_range_min", {
                  valueAsNumber: true,
                })}
                className="pl-8"
                placeholder="0"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Max</Label>
            <div className="relative">
              <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                {currencySymbol}
              </span>
              <Input
                type="number"
                disabled={!salaryEnabled}
                {...form.register("salary_range_max", {
                  valueAsNumber: true,
                })}
                className="pl-8"
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          {...form.register("observation")}
          placeholder="Optional notes…"
          rows={3}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={jobDescriptionId}>Job description</Label>
        <Textarea
          id={jobDescriptionId}
          {...form.register("job_description")}
          placeholder="Paste the job posting here — it sits beside this application's CV copy while you tailor it."
          rows={6}
          aria-invalid={
            form.formState.errors.job_description ? true : undefined
          }
          className={cn(
            form.formState.errors.job_description &&
              "border-destructive focus-visible:ring-destructive",
          )}
        />
        {form.formState.errors.job_description ? (
          <p className="text-xs text-destructive">
            {form.formState.errors.job_description.message}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Optional. Shown next to the CV copy on the application&apos;s CV
            page.
          </p>
        )}
      </div>
    </div>
  );
}
