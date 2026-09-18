import {
  AvailabilityType,
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
} from "./services/types/users";
import {
  CURRENCY_OPTIONS,
  SALARY_PERIOD_OPTIONS,
} from "@/components/timeline/timeline-options";

/**
 * AC9 (R-031): derived from the single source of truth
 * (`@/components/timeline/timeline-options`) so this file's shape (`symbol`
 * for currency, `sufix` — this file's own long-standing typo, kept so no
 * caller needs to change — for the period suffix) stays intact for every
 * existing caller (profile, application create/edit) while the VALUES are
 * the shared 20 currencies / `hourly | monthly | annually`.
 */
const CURRENCY = CURRENCY_OPTIONS.map((option) => ({
  value: option.value,
  symbol: option.symbol,
})) as { value: SalaryCurrencyType; symbol: string }[];

const SALARY_PERIOD = SALARY_PERIOD_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  sufix: option.suffix,
})) as { value: SalaryPeriodType; label: string; sufix: string }[];

const SENIORITY = [
  { value: "intern", label: "Intern" },
  { value: "junior", label: "Junior" },
  { value: "mid_level", label: "Mid Level" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "lead", label: "Lead" },
  { value: "principal", label: "Principal" },
  { value: "specialist", label: "Specialist" },
] as { value: SeniorityLevelType; label: string }[];

const AVAILABILITY = [
  { value: "open_to_work", label: "Open to work" },
  { value: "casually_looking", label: "Casually looking" },
  { value: "not_looking", label: "Not looking" },
] as { value: AvailabilityType; label: string }[];

const WORK_MODE = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on_site", label: "On-site" },
] as const;

const SOURCE = [
  { value: "active", label: "Active (I applied)" },
  { value: "passive", label: "Passive (Recruiter contacted me)" },
] as const;

export const SelectOptions = {
  CURRENCY,
  SALARY_PERIOD,
  SENIORITY,
  AVAILABILITY,
  WORK_MODE,
  SOURCE,
};
