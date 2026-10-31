import {
  DEFAULT_INTERVIEW_TYPE,
  stageLabel,
} from "@/components/timeline/timeline-options";
import type {
  InterviewType,
  TimelineEventType,
} from "@/components/timeline/timeline-types";
import { word } from "@/i18n/translator";

const APP_NAME = "Applika.dev";

/**
 * The OLD English stage words, frozen. They feed only the UID line below and
 * never follow the app language: the UID is the event's identity inside the
 * calendar file, and changing it — by the "·" joiner becoming the hyphen, or
 * by a word becoming Portuguese — would make re-importing the same event
 * create a duplicate instead of updating it.
 */
const LEGACY_EVENT_TYPE_LABELS: Record<TimelineEventType, string> = {
  interview: "Interview",
  offer: "Offer",
  denied: "Denied",
};

const LEGACY_INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  unknown: "Unknown",
  initial_screening: "Initial screening",
  technical: "Technical",
  cultural: "Cultural",
  hiring_manager: "Hiring manager",
  take_home: "Take-home",
  final: "Final",
};

/**
 * The event's OLD stage text, joined with "·" (never the hyphen of
 * `stageLabel`), in English in every language. Used ONLY in the UID line.
 * The SUMMARY line and the downloaded file's name follow `stageLabel` (the
 * hyphen, the active language) like every other stage-label surface.
 */
function legacyStageLabel(
  eventType: TimelineEventType,
  interviewType?: InterviewType | null,
): string {
  const base = LEGACY_EVENT_TYPE_LABELS[eventType];
  if (eventType !== "interview") return base;
  return `${base} · ${LEGACY_INTERVIEW_TYPE_LABELS[interviewType ?? DEFAULT_INTERVIEW_TYPE]}`;
}

/** Converts "HH:MM" or "HH:MM:SS" to ICS "HHMMSS" format */
function toIcsTime(t: string): string {
  const parts = t.split(":");
  const hh = parts[0];
  const mm = parts[1];
  const ss = parts[2] ?? "00";
  return `${hh}${mm}${ss}`;
}

/**
 * Agenda item shape needed for the .ics export (PRD 0008, ADR 0012). Labelled
 * from `event_type`/`interview_type` via `stageLabel`, NEVER from the
 * now-nullable, legacy `step_name`/`step_color` (AC6, R-026).
 */
export function genAgendaStepIcsFile(step: {
  step_date: string;
  event_type: TimelineEventType;
  interview_type?: InterviewType | null;
  company_name: string;
  role: string;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  observation?: string;
  application_id: string;
}) {
  const dateClean = step.step_date.replace(/-/g, "");
  const stepName = stageLabel(step.event_type, step.interview_type);
  const title = `${step.company_name} — ${stepName}`;
  const tz = step.timezone;

  let dtStart: string;
  let dtEnd: string;

  if (step.start_time) {
    const startClean = toIcsTime(step.start_time);
    dtStart = tz
      ? `DTSTART;TZID=${tz}:${dateClean}T${startClean}`
      : `DTSTART:${dateClean}T${startClean}`;

    if (step.end_time) {
      const endClean = toIcsTime(step.end_time);
      dtEnd = tz
        ? `DTEND;TZID=${tz}:${dateClean}T${endClean}`
        : `DTEND:${dateClean}T${endClean}`;
    } else {
      const [h, m] = step.start_time.split(":").map(Number);
      const endH = String(Math.min(h + 1, 23)).padStart(2, "0");
      const endClean = `${endH}${String(m).padStart(2, "0")}00`;
      dtEnd = tz
        ? `DTEND;TZID=${tz}:${dateClean}T${endClean}`
        : `DTEND:${dateClean}T${endClean}`;
    }
  } else {
    const [y, mo, d] = step.step_date.split("-").map(Number);
    const nextDay = new Date(y, mo - 1, d + 1);
    const end = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, "0")}${String(nextDay.getDate()).padStart(2, "0")}`;
    dtStart = `DTSTART;VALUE=DATE:${dateClean}`;
    dtEnd = `DTEND;VALUE=DATE:${end}`;
  }

  const descriptionLines = [
    word("agenda.calendar.role", { role: step.role }),
    word("agenda.calendar.company", { company: step.company_name }),
    step.observation
      ? word("agenda.calendar.notes", { notes: step.observation })
      : "",
    "",
    word("agenda.calendar.managedBy", { app: APP_NAME }),
  ].filter(Boolean);

  const description = descriptionLines.join(" — ");

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//EN`,
    "BEGIN:VEVENT",
    dtStart,
    dtEnd,
    `DTSTAMP:${stamp}`,
    `UID:${step.application_id}-${dateClean}-${legacyStageLabel(step.event_type, step.interview_type)}@applika`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${step.company_name}-${stepName}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
