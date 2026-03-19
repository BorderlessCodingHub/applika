"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { services } from "@/container/services";
import {
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
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CompanySearch } from "@/components/shared/company-search";
import { SelectOptions } from "@/options";
import {
  SalaryCurrencyType,
  SalaryCurrencyValues,
  SalaryPeriodType,
  SalaryPeriodValues,
  SeniorityLevelType,
  SeniorityLevelValues,
} from "@/services/types/users";
import { AxiosError } from "axios";
import { getApiError } from "@/lib/api-client";

function getCurrencySymbol(currency: string) {
  return (
    SelectOptions.CURRENCY.find((c) => c.value === currency)?.symbol ?? currency
  );
}

const schema = z
  .object({
    company_id: z.string().min(1, "Company is required"),
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
    company_id: application?.company.id ?? "",
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

export function ApplicationFormSheet({
  open,
  onOpenChange,
  application,
}: Props) {
  const { supports } = useSupports();
  const queryClient = useQueryClient();
  const isEdit = !!application;

  const [resetKey, setResetKey] = useState(0);
  const [prevApplication, setPrevApplication] = useState(application);
  const [prevOpen, setPrevOpen] = useState(open);

  if (prevApplication !== application || prevOpen !== open) {
    setPrevApplication(application);
    setPrevOpen(open);
    setResetKey((k) => k + 1);
  }

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaultValues(application),
  });

  const companyId = useWatch({ control: form.control, name: "company_id" });
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
  const hasValidCompany = !!companyId;
  const fieldsDisabled = !hasValidCompany;
  const salaryEnabled = !!watchCurrency && !!watchSalaryPeriod;
  const currencySymbol = watchCurrency ? getCurrencySymbol(watchCurrency) : "$";

  const initialCompany = useMemo(() => {
    if (!application?.company) return null;
    return { id: application.company.id, name: application.company.name };
  }, [application]);

  useEffect(() => {
    if (application) {
      form.reset(buildDefaultValues(application));
    } else {
      form.reset();
    }
  }, [application, open, form]);

  const mutation = useMutation({
    mutationFn: (data: CreateApplicationPayload) =>
      isEdit
        ? services.applications.updateApplication(application!.id, data)
        : services.applications.createApplication(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["statistics"] });
      toast.success(isEdit ? "Application updated" : "Application created");
      onOpenChange(false);
    },
    onError: (error: AxiosError) => {
      const message = getApiError(error)
      toast.error(message)
    },
  });

  const onSubmit = (data: FormData) => {
    const includeSalary = !!data.currency && !!data.salary_period;
    const payload: CreateApplicationPayload = {
      company_id: data.company_id,
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
      old_company: "applika",
    };
    mutation.mutate(payload);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {isEdit ? "Edit Application" : "New Application"}
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
          <CompanySearch
            initialCompany={initialCompany}
            resetKey={resetKey}
            onCompanyChange={(company) => {
              form.setValue("company_id", company?.id ?? "", {
                shouldValidate: true,
              });
            }}
          />
          {form.formState.errors.company_id && (
            <p className="mt-1 text-xs text-destructive">
              {form.formState.errors.company_id.message}
            </p>
          )}

          {/* All remaining fields are disabled until a valid company is selected */}
          <fieldset
            disabled={fieldsDisabled}
            className={fieldsDisabled ? "space-y-4 opacity-50" : "space-y-4"}
          >
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
                  disabled={fieldsDisabled}
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
                  disabled={fieldsDisabled}
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
                <Input
                  type="date"
                  max={new Date().toISOString().split("T")[0]}
                  {...form.register("application_date")}
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
                  disabled={fieldsDisabled}
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
                  disabled={fieldsDisabled}
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
                <Input
                  {...form.register("country")}
                  placeholder="e.g. Brazil"
                />
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
                    disabled={fieldsDisabled}
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
                    disabled={fieldsDisabled}
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
              type="submit"
              className="w-full"
              disabled={mutation.isPending || fieldsDisabled}
            >
              {mutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEdit ? "Save changes" : "Create application"}
            </Button>
          </fieldset>
        </form>
      </SheetContent>
    </Sheet>
  );
}
