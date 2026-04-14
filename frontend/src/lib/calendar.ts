import type { Application } from "@/services/types/applications";

const APP_NAME = "Applika.dev";

/** Converts "HH:MM" or "HH:MM:SS" to ICS "HHMMSS" format */
function toIcsTime(t: string): string {
  const parts = t.split(":");
  const hh = parts[0];
  const mm = parts[1];
  const ss = parts[2] ?? "00";
  return `${hh}${mm}${ss}`;
}

interface CalendarOptions {
  startTime?: string;
  endTime?: string;
  timezone?: string;
}

export function genApplicationStepIcsFile(
  date: string,
  stepName: string,
  application: Application,
  options?: CalendarOptions,
) {
  const dateClean = date.replace(/-/g, "");
  const title = `${application.company_name} — ${stepName}`;
  const tz = options?.timezone;

  let dtStart: string;
  let dtEnd: string;

  if (options?.startTime) {
    const startClean = toIcsTime(options.startTime);
    dtStart = tz
      ? `DTSTART;TZID=${tz}:${dateClean}T${startClean}`
      : `DTSTART:${dateClean}T${startClean}`;

    if (options.endTime) {
      const endClean = toIcsTime(options.endTime);
      dtEnd = tz
        ? `DTEND;TZID=${tz}:${dateClean}T${endClean}`
        : `DTEND:${dateClean}T${endClean}`;
    } else {
      // Default 1-hour event
      const [h, m] = options.startTime.split(":").map(Number);
      const endH = String(Math.min(h + 1, 23)).padStart(2, "0");
      const endClean = `${endH}${String(m).padStart(2, "0")}00`;
      dtEnd = tz
        ? `DTEND;TZID=${tz}:${dateClean}T${endClean}`
        : `DTEND:${dateClean}T${endClean}`;
    }
  } else {
    // All-day event
    const [y, mo, d] = date.split("-").map(Number);
    const nextDay = new Date(y, mo - 1, d + 1);
    const end = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, "0")}${String(nextDay.getDate()).padStart(2, "0")}`;
    dtStart = `DTSTART;VALUE=DATE:${dateClean}`;
    dtEnd = `DTEND;VALUE=DATE:${end}`;
  }

  const descriptionLines = [
    `Role: ${application.role}`,
    `Company: ${application.company_name}`,
    `Mode: ${application.mode}`,
    application.work_mode ? `Work Mode: ${application.work_mode}` : "",
    application.experience_level
      ? `Experience: ${application.experience_level}`
      : "",
    application.link_to_job ? `Job Link: ${application.link_to_job}` : "",
    application.observation ? `Notes: ${application.observation}` : "",
    "",
    `Managed by ${APP_NAME}`,
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
    `UID:${application.id}-${dateClean}-${stepName}@applika`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${application.company_name}-${stepName}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function genAgendaStepIcsFile(step: {
  step_date: string;
  step_name?: string;
  company_name: string;
  role: string;
  start_time?: string;
  end_time?: string;
  timezone?: string;
  observation?: string;
  application_id: string;
}) {
  const dateClean = step.step_date.replace(/-/g, "");
  const stepName = step.step_name ?? "Step";
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
    `Role: ${step.role}`,
    `Company: ${step.company_name}`,
    step.observation ? `Notes: ${step.observation}` : "",
    "",
    `Managed by ${APP_NAME}`,
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
    `UID:${step.application_id}-${dateClean}-${stepName}@applika`,
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
