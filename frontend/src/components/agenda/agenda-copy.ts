import { format } from "date-fns";

import type { Locale } from "@/i18n/config";
import { dateFnsLocale } from "@/i18n/date-locale";
import { getTranslatorLocale, word } from "@/i18n/translator";

/** Event count beside the card timeline's heading, e.g. "1 event", "3 events". */
export function agendaTimelineCountLabel(count: number): string {
  return word("agenda.count.events", { count });
}

/** Tab accessible name, e.g. "Upcoming (3)"; the visible Badge is aria-hidden. */
export function agendaTabLabel(tab: string, count: number): string {
  return word("agenda.count.tab", { tab, count });
}

/** Date-group count, e.g. "1 application", "3 applications". */
export function agendaGroupCountLabel(count: number): string {
  return word("agenda.count.applications", { count });
}

/** A step date, written the way each language writes it. */
const AGENDA_DATE_PATTERN: Record<Locale, string> = {
  en: "MMM d, yyyy",
  "pt-BR": "d 'de' MMM 'de' yyyy",
};

/**
 * "yyyy-MM-dd" -> "Sep 18, 2026" / "18 de set de 2026", parsed as a LOCAL
 * date (never UTC midnight). Components pass `useLocale()`; without it the
 * module translator's language is used.
 */
export function formatAgendaDate(
  date: string,
  locale: string = getTranslatorLocale(),
): string {
  return format(
    new Date(`${date}T00:00:00`),
    AGENDA_DATE_PATTERN[locale as Locale] ?? AGENDA_DATE_PATTERN.en,
    { locale: dateFnsLocale(locale) },
  );
}

/**
 * Accessible names of a card's controls. `role` and `company` are the user's
 * own text and go in as sent.
 */
export function agendaItemNames(role: string, company: string) {
  const values = { role, company };
  return {
    open: word("agenda.names.open", values),
    addToCalendar: word("agenda.names.addToCalendar", values),
    alerts: word("agenda.names.alerts", values),
    timeline: word("agenda.names.timeline", values),
  };
}
