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
import { word } from "@/i18n/translator";

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
  get label() {
    return option.label;
  },
  get sufix() {
    return option.suffix;
  },
})) as { value: SalaryPeriodType; label: string; sufix: string }[];

/**
 * An option list whose labels are getters: each read returns the words of the
 * active language (`options.<group>.<value>`). Components rendering them
 * subscribe with `useTranslations`, so a switch re-renders them.
 */
function liveOptions<V extends string>(group: string, values: readonly V[]) {
  return values.map((value) => ({
    value,
    get label() {
      return word(`options.${group}.${value}`);
    },
  }));
}

const SENIORITY = liveOptions("seniority", [
  "intern",
  "junior",
  "mid_level",
  "senior",
  "staff",
  "lead",
  "principal",
  "specialist",
] as const) as { value: SeniorityLevelType; label: string }[];

const AVAILABILITY = liveOptions("availability", [
  "open_to_work",
  "casually_looking",
  "not_looking",
] as const) as { value: AvailabilityType; label: string }[];

const WORK_MODE = liveOptions("workMode", [
  "remote",
  "hybrid",
  "on_site",
] as const);

const SOURCE = liveOptions("source", ["active", "passive"] as const);

export const SelectOptions = {
  CURRENCY,
  SALARY_PERIOD,
  SENIORITY,
  AVAILABILITY,
  WORK_MODE,
  SOURCE,
};
