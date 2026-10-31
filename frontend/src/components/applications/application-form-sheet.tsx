"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { formatNumber } from "@/i18n/format-number";
import { getTranslatorLocale, word } from "@/i18n/translator";
import {
  Company,
  ModeValues,
  WorkModeValues,
  type Application,
  type CreateApplicationPayload,
} from "@/services/types/applications";
import { usePlatforms } from "@/hooks/use-platforms";
import { isNotFutureCalendarDay } from "@/components/application-drafts/draft-copy";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  SalaryCurrencyValues,
  SalaryPeriodValues,
  SeniorityLevelValues,
} from "@/services/types/users";
import { ZodType } from "./company-select";
import {
  ApplicationFields,
  JOB_DESCRIPTION_MAX,
  type ApplicationFieldsValues,
} from "./application-fields";
import { useCompanySearch } from "@/hooks/use-companies";
import { useApplicationMutate } from "@/hooks/use-applications";
import { useCreatePlatformOutcome } from "@/hooks/use-create-platform";

/**
 * A validation message read at validation time, so it is written in the
 * active language (`applications.validation.*`).
 */
function message(key: string, values?: () => Record<string, string>) {
  return { error: () => word(`applications.validation.${key}`, values?.()) };
}

const schema = z
  .object({
    company: ZodType.ZodSchema,
    platform_id: z.string().min(1, message("platformRequired")),
    role: z.string().min(1, message("roleRequired")),
    mode: z.enum(ModeValues, message("sourceRequired")),
    application_date: z
      .string()
      .min(1, message("dateRequired"))
      .refine((v) => isNotFutureCalendarDay(v), message("dateInFuture")),
    link_to_job: z.union([z.literal(""), z.httpUrl(message("invalidUrl"))]),
    currency: z.enum(SalaryCurrencyValues).optional(),
    salary_period: z.enum(SalaryPeriodValues).optional(),
    expected_salary: z.nan().or(z.number()),
    salary_range_min: z.nan().or(z.number()),
    salary_range_max: z.nan().or(z.number()),
    experience_level: z.enum(SeniorityLevelValues).optional(),
    work_mode: z.enum(WorkModeValues).optional(),
    country: z.string().optional(),
    observation: z.string().optional(),
    // Optional, and capped under the server's 50 000 so a 422 — which
    // `getApiError` would render as a raw FastAPI detail array — is unreachable.
    job_description: z
      .string()
      .max(
        JOB_DESCRIPTION_MAX,
        message("jobDescriptionTooLong", () => ({
          // "50000" in English (as before), "50.000" in Portuguese.
          max: formatNumber(JOB_DESCRIPTION_MAX, getTranslatorLocale()),
        })),
      )
      .optional(),
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
          message: word("applications.validation.requiredWithSalary"),
          path: ["currency"],
        });
      }
      if (!data.salary_period) {
        ctx.addIssue({
          code: "custom",
          message: word("applications.validation.requiredWithSalary"),
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
  const company = application?.company_id
    ? application.company_id
    : application?.company_name
      ? { name: application.company_name, url: "" }
      : undefined;

  return {
    company,
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
    job_description: application?.job_description ?? undefined,
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
  const { data: platforms, isLoading: platformsLoading } = usePlatforms();
  const { fetchCompanies } = useCompanySearch();
  const createPlatformOutcome = useCreatePlatformOutcome();
  const t = useTranslations("applications.form");
  const { submit: applicationSubmit, isPending } = useApplicationMutate({
    applicationId: application ? application.id : undefined,
    onSuccess: () => onOpenChange(false),
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaultValues(application),
  });

  const companySelectValue = buildCompanySelectDefaultValue(application);

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
      job_description: data.job_description?.trim()
        ? data.job_description
        : null,
    };
    await applicationSubmit(payload);
  }

  return (
    <Sheet open={open}>
      <SheetContent className="overflow-y-auto" size="wide" hideClose>
        <SheetHeader>
          <SheetTitle className="font-display text-xl">
            {application ? t("editTitle") : t("newTitle")}
          </SheetTitle>
        </SheetHeader>
        <form
          onSubmit={form.handleSubmit(handleFormSubmit)}
          className="mt-6 space-y-4"
        >
          <ApplicationFields
            form={
              form as unknown as ReturnType<
                typeof useForm<ApplicationFieldsValues>
              >
            }
            fetchCompanies={fetchCompanies}
            companySelectValue={companySelectValue}
            platforms={platforms}
            platformsLoading={platformsLoading}
            onCreatePlatform={createPlatformOutcome}
          />

          <Button
            type="button"
            className="w-full"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {application ? t("save") : t("create")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
