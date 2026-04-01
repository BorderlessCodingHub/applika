"use client";

import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Company,
  ModeType,
  ModeValues,
  WorkModeType,
  WorkModeValues,
  type Application,
  type CreateApplicationPayload,
} from "@/services/types/applications";
import { useSupports } from "@/contexts/supports-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";
import { SelectOptions } from "@/options";
import {
  SalaryCurrencyType,
  SalaryCurrencyValues,
  SalaryPeriodType,
  SalaryPeriodValues,
  SeniorityLevelType,
  SeniorityLevelValues,
} from "@/services/types/users";
import { CompanySelect, ZodType } from "./company-select";
import { useCompanySearch } from "@/hooks/use-companies";
import { DatePickerInput } from "../ui/date-picker";
import { useApplicationMutate } from "@/hooks/use-applications";

function getCurrencySymbol(currency: string) {
  return (
    SelectOptions.CURRENCY.find((c) => c.value === currency)?.symbol ?? currency
  );
}

const schema = z
  .object({
    company: ZodType.ZodSchema,
    platform_id: z.string().min(1, "Platform is required"),
    role: z.string().min(1, "Role is required"),
    mode: z.enum(ModeValues, {
      error: "Source is required",
    }),
    application_date: z
      .string()
      .min(1, "Application date is required")
      .refine((v) => new Date(v) <= new Date(), "Date cannot be in the future"),
    link_to_job: z.union([
      z.literal(""),
      z.httpUrl({
        error: "Invalid url.",
      }),
    ]),
    currency: z.enum(SalaryCurrencyValues).optional(),
    salary_period: z.enum(SalaryPeriodValues).optional(),
    expected_salary: z.nan().or(z.number()),
    salary_range_min: z.nan().or(z.number()),
    salary_range_max: z.nan().or(z.number()),
    experience_level: z.enum(SeniorityLevelValues).optional(),
    work_mode: z.enum(WorkModeValues).optional(),
    country: z.string().optional(),
    observation: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasSalary =
      (data.expected_salary && data.expected_salary !== 0) ||
      (data.salary_range_min && data.salary_range_min !== 0) ||
      (data.salary_range_max && data.salary_range_max !== 0);

    if (hasSalary) {
      if (!data.currency) {
        ctx.addIssue({
          code: "custom",
          message: "Required when salary is set",
          path: ["currency"],
        });
      }
      if (!data.salary_period) {
        ctx.addIssue({
          code: "custom",
          message: "Required when salary is set",
          path: ["salary_period"],
        });
      }
    }
  });

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: Application | null;
}

function buildDefaultValues(application: Application | null) {
  return {
    company: application?.company_id
      ? application.company_id
      : application?.company_name
        ? { name: application.company_name, url: "" }
        : undefined,
    role: application?.role ?? undefined,
    platform_id: application?.platform_id ?? "",
    mode: application?.mode ?? undefined,
    application_date: application?.application_date ?? "",
    link_to_job: application?.link_to_job ?? undefined,
    currency: application?.currency ?? undefined,
    salary_period: application?.salary_period ?? undefined,
    expected_salary: application?.expected_salary ?? undefined,
    salary_range_min: application?.salary_range_min ?? undefined,
    salary_range_max: application?.salary_range_max ?? undefined,
    experience_level: application?.experience_level ?? undefined,
    work_mode: application?.work_mode ?? undefined,
    country: application?.country ?? undefined,
    observation: application?.observation ?? undefined,
  } as FormData;
}

function buildCompanySelectDefaultValue(application: Application | null) {
  if (!application) return null;

  return {
    id: application.company_id,
    name: application.company_name,
  } as Company;
}

export function ApplicationFormSheet({
  open,
  onOpenChange,
  application,
}: Props) {
  const { supports } = useSupports();
  const { fetchCompanies } = useCompanySearch();
  const { submit, isPending } = useApplicationMutate({
    applicationId: application ? application.id : undefined,
    onSuccess: () => onOpenChange(false),
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaultValues(application),
  });

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
  const watchWorkMode = useWatch({ control: form.control, name: "work_mode" });
  const watchExperienceLevel = useWatch({
    control: form.control,
    name: "experience_level",
  });
  const salaryEnabled = !!watchCurrency && !!watchSalaryPeriod;
  const currencySymbol = watchCurrency ? getCurrencySymbol(watchCurrency) : "$";

  async function handleFormSubmit(data: FormData) {
    const includeSalary = !!data.currency && !!data.salary_period;

    const payload: CreateApplicationPayload = {
      company: ZodType.parseSchema(data.company),
      platform_id: data.platform_id,
      role: data.role,
      mode: data.mode,
      application_date: data.application_date,
      link_to_job: data.link_to_job === "" ? undefined : data.link_to_job,
      currency: includeSalary ? data.currency : undefined,
      salary_period: includeSalary ? data.salary_period : undefined,
      expected_salary: includeSalary ? data.expected_salary : undefined,
      salary_range_min: includeSalary ? data.salary_range_min : undefined,
      salary_range_max: includeSalary ? data.salary_range_max : undefined,
      experience_level: data.experience_level,
      work_mode: data.work_mode,
      country: data.country,
      observation: data.observation,
    };
    await submit(payload);
  }

  const companySelectValue = useMemo(
    () => buildCompanySelectDefaultValue(application),
    [application?.company_id, application?.company_name],
  );

  const companyUrlInputError = (() => {
    if (!isCompanyObject) return undefined;

    type CmpUrlError = undefined | { url?: { message?: string } };
    const cmpErr = form.formState.errors.company as CmpUrlError;
    return cmpErr?.url;
  })();

  return (
    <Sheet open={open}>
      <SheetContent className="overflow-y-auto" hideClose>
        <SheetHeader>
          <SheetTitle>
            {application ? "Edit Application" : "New Application"}
          </SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="mt-6 space-y-4"
        >
          <CompanySelect
            value={companySelectValue}
            form={form}
            fetchCompanies={fetchCompanies}
          />
          {isCompanyObject && (
            <div className="space-y-1.5">
              <Label>Company URL</Label>
              <Input
                {...form.register("company.url")}
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
              <Label>Platform *</Label>
              <Select
                value={String(watchPlatformId || "")}
                onValueChange={(v) => {
                  form.setValue("platform_id", v);
                  form.clearErrors("platform_id");
                }}
              >
                <SelectTrigger
                  className={cn(
                    form.formState.errors.platform_id &&
                      "border-destructive focus:ring-destructive",
                  )}
                >
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {supports?.platforms.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  form.setValue("mode", v as ModeType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Application Date *</Label>
              <DatePickerInput
                value={form.watch("application_date")}
                onChange={(date) =>
                  form.setValue("application_date", date ? date : "", {
                    shouldValidate: true,
                  })
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
            />
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
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
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
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
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
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
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

          <Button
            type="button"
            className="w-full"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {application ? "Save changes" : "Create application"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
