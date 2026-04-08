import z from "zod";
import { SelectOptions } from "@/options";
import {
  AvailabilityValues,
  SalaryCurrencyValues,
  SalaryPeriodValues,
  SeniorityLevelValues,
  User,
} from "@/services/types/users";

export function getCurrencySymbol(c?: string) {
  return SelectOptions.CURRENCY.find((o) => o.value === c)?.symbol ?? "$";
}

export const UserProfileSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  current_role: z.string().optional(),
  current_company: z.string().optional(),
  current_salary: z.number().optional(),
  salary_currency: z.union([z.undefined(), z.enum(SalaryCurrencyValues)]),
  salary_period: z.union([z.undefined(), z.enum(SalaryPeriodValues)]),
  experience_years: z.number().optional(),
  seniority_level: z.union([z.undefined(), z.enum(SeniorityLevelValues)]),
  location: z.string().optional(),
  availability: z.union([z.undefined(), z.enum(AvailabilityValues)]),
  bio: z.string().optional(),
  linkedin_url: z.string().optional(),
  tech_stack_raw: z.string().optional(),
});

export type UserProfileFormData = z.infer<typeof UserProfileSchema>;

export function buildDefaultValues(user: User): UserProfileFormData {
  return {
    first_name: user.first_name ?? undefined,
    last_name: user.last_name ?? undefined,
    bio: user.bio ?? undefined,
    current_role: user.current_role ?? undefined,
    current_company: user.current_company ?? undefined,
    salary_currency: user.salary_currency ?? undefined,
    current_salary: user.current_salary ?? undefined,
    salary_period: user.salary_period ?? undefined,
    experience_years: user.experience_years ?? undefined,
    seniority_level: user.seniority_level ?? undefined,
    location: user.location ?? undefined,
    availability: user.availability ?? undefined,
    linkedin_url: user.linkedin_url ?? undefined,
    tech_stack_raw: user.tech_stack?.join(", "),
  };
}
