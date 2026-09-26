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
 * Step 1 of `/applications/new-with-cv` (PRD 0010, KODI-033, revised
 * KODI-036): the same fields the side sheet asks for, including the
 * application date (AC1/AC3 — preset to today, saved with the draft, kept on
 * resume) and with `mode` preset to `active` by the page's default values.
 * No width limit of its own (AC5) — the form fills the page's content
 * column. The page owns the form, the autosave wiring and the
 * company-resolution side effect (`onCompanyChange`); this component only
 * composes `ApplicationFields`.
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
      sectionHeadingAs="h2"
    />
  );
}
