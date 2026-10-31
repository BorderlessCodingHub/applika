import type { Locale as DateFnsLocale } from "date-fns/locale";
// react-day-picker's locales extend date-fns' with the calendar's own
// accessible names ("Go to the Next Month", "Navigation bar"), so date-fns
// `format` and DayPicker both read them.
import { enUS, ptBR } from "react-day-picker/locale";

import type { Locale } from "@/i18n/config";

/** The date-fns (and react-day-picker) locale for an app language. */
export function dateFnsLocale(locale: string): DateFnsLocale {
  return (locale as Locale) === "pt-BR" ? ptBR : enUS;
}
