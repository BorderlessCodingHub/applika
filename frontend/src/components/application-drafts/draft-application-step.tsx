"use client";

import type { UseFormReturn } from "react-hook-form";

import {
  ApplicationFields,
  type ApplicationFieldsValues,
} from "@/components/applications/application-fields";
import type {
  NewPlatformInput,
  PlatformCreateOutcome,
  PlatformOption,
} from "@/components/applications/platform-select";
import type { Company } from "@/services/types/applications";

export interface DraftApplicationStepProps {
  form: UseFormReturn<ApplicationFieldsValues>;
  fetchCompanies: (query: string) => Promise<Company[]>;
  companySelectValue: Company | null;
  onCompanyChange: (company: Company | null) => void;
  platforms: readonly PlatformOption[] | undefined;
  platformsLoading?: boolean;
  onCreatePlatform: (input: NewPlatformInput) => Promise<PlatformCreateOutcome>;
}

/**
 * Step 1 of `/applications/new-with-cv` (PRD 0010, KODI-033): the same fields
 * the side sheet asks for, minus the application date (AC3 — the draft is
 * dated on finish, from the browser's own calendar day) and with `mode`
 * preset to `active` by the page's default values. The page owns the form,
 * the autosave wiring and the company-resolution side effect
 * (`onCompanyChange`); this component only composes `ApplicationFields`.
 */
export function DraftApplicationStep({
  form,
  fetchCompanies,
  companySelectValue,
  onCompanyChange,
  platforms,
  platformsLoading,
  onCreatePlatform,
}: DraftApplicationStepProps) {
  return (
    <ApplicationFields
      form={form}
      fetchCompanies={fetchCompanies}
      companySelectValue={companySelectValue}
      onCompanyChange={onCompanyChange}
      platforms={platforms}
      platformsLoading={platformsLoading}
      onCreatePlatform={onCreatePlatform}
      showDate={false}
      className="max-w-4xl"
      sectionHeadingAs="h2"
    />
  );
}
