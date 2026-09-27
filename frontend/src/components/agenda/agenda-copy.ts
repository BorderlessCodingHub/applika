import { format } from "date-fns";

import { applicationName } from "@/components/applications/application-card-copy";

export const AGENDA_PAGE_COPY = {
  title: "Agenda",
  subtitle: "Your application steps organized by date",
  searchPlaceholder: "Search applications...",
  searchLabel: "Search applications",
  stageFilterLabel: "Filter by stage",
  allStages: "All stages",
  upcomingTab: "Upcoming",
  pastTab: "Past",
  emptyUpcoming: "No upcoming interviews",
  emptyPast: "No past interviews in the last 30 days",
  emptyFiltered: "No interviews match your search",
  goToApplications: "Go to Applications",
  loadErrorTitle: "We couldn't load your agenda",
  retry: "Retry",
  loading: "Loading agenda",
} as const;

export const AGENDA_CARD_COPY = {
  allDay: "All day",
  converted: "(converted)",
  noNotes: "No notes",
  addToCalendarTooltip: "Add to calendar",
  alertOffTooltip: "Alert at 30, 15 & 5 min before",
  alertOnTooltip: "Disable sound alerts",
  openTooltip: "Open in Applications",
} as const;

/** The read-only timeline the card's chevron reveals (KODI-038, R-012). */
export const AGENDA_TIMELINE_COPY = {
  loading: "Loading timeline",
  loadErrorTitle: "We couldn't load the timeline",
  loadErrorFallback: "Something went wrong fetching this application's events.",
  emptyTitle: "No events yet",
  emptyDescription: "There is no activity recorded for this application.",
} as const;

/** Event count beside the card timeline's heading, e.g. "1 event", "3 events". */
export function agendaTimelineCountLabel(count: number): string {
  return `${count} event${count === 1 ? "" : "s"}`;
}

/** Tab accessible name, e.g. "Upcoming (3)"; the visible Badge is aria-hidden. */
export function agendaTabLabel(tab: string, count: number): string {
  return `${tab} (${count})`;
}

/** Date-group count, e.g. "1 application", "3 applications". */
export function agendaGroupCountLabel(count: number): string {
  return `${count} application${count === 1 ? "" : "s"}`;
}

/** "yyyy-MM-dd" -> "Sep 18, 2026", parsed as a LOCAL date (never UTC midnight). */
export function formatAgendaDate(date: string): string {
  return format(new Date(`${date}T00:00:00`), "MMM d, yyyy");
}

export function agendaItemNames(role: string, company: string) {
  const name = applicationName(role, company);
  return {
    open: `Open ${name}`,
    addToCalendar: `Add ${name} to calendar`,
    alerts: `Sound alerts for ${name}`,
    timeline: `Timeline for ${name}`,
  };
}
