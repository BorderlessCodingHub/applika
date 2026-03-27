import {
  AvailabilityType,
  SalaryCurrencyType,
  SalaryPeriodType,
  SeniorityLevelType,
} from "./services/types/users";

const CURRENCY = [
  { value: "USD", symbol: "$" },
  { value: "BRL", symbol: "R$" },
  { value: "EUR", symbol: "€" },
  { value: "GBP", symbol: "£" },
  { value: "CAD", symbol: "C$" },
  { value: "AUD", symbol: "A$" },
  { value: "JPY", symbol: "¥" },
  { value: "CHF", symbol: "CHF" },
  { value: "INR", symbol: "₹" },
] as { value: SalaryCurrencyType; symbol: string }[];

const SALARY_PERIOD = [
  { value: "hourly", label: "Hourly", sufix: "/hr" },
  { value: "monthly", label: "Monthly", sufix: "/mo" },
  { value: "annual", label: "Annual", sufix: "/yr" },
] as { value: SalaryPeriodType; label: string; sufix: string }[];

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

export function formatSalary(
  value: number | undefined | null,
  currency?: SalaryCurrencyType,
  period?: SalaryPeriodType,
) {
  if (value == null) return "";

  const c = CURRENCY.find((x) => x.value === currency);
  const sym = c ? c.symbol : "$";

  const s = SALARY_PERIOD.find((x) => x.value === period);
  const suf = s ? s.sufix : "";

  return `${sym}${value.toLocaleString()}${suf}`;
}
