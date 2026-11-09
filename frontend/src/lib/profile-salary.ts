import { getCurrencySymbol } from "@/components/profile/edit-form-config";
import { SelectOptions } from "@/options";
import type { User } from "@/services/types/users";

/**
 * The profile's salary line, "€58,000 / annually": the currency's symbol, the
 * amount in the active language's digits, then the period in lower case when
 * one is set. `null` without a salary. The desktop profile and the phone
 * profile write it the same way.
 */
export function formatProfileSalary(
  user: Pick<User, "current_salary" | "salary_currency" | "salary_period">,
  intlLocale: string,
): string | null {
  if (user.current_salary == null) return null;
  const currencySymbol = getCurrencySymbol(user.salary_currency);
  const periodLabel =
    SelectOptions.SALARY_PERIOD.find(
      (o) => o.value === user.salary_period,
    )?.label?.toLowerCase() ?? "";
  return `${currencySymbol}${user.current_salary.toLocaleString(intlLocale)}${periodLabel ? ` / ${periodLabel}` : ""}`;
}
