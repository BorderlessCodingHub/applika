import type { Application } from "@/services/types/applications";

const APP_NAME = "Applika.dev";

export function genApplicationStepIcsFile(
  date: string,
  stepName: string,
  application: Application
) {
  const dateClean = date.replace(/-/g, "");
  // All-day event: DTEND is the next day
  const start = dateClean;
  const [y, m, d] = date.split("-").map(Number);
  const nextDay = new Date(y, m - 1, d + 1);
  const end = `${nextDay.getFullYear()}${String(nextDay.getMonth() + 1).padStart(2, "0")}${String(nextDay.getDate()).padStart(2, "0")}`;

  const title = `${application.company.name} — ${stepName}`;

  const descriptionLines = [
    `Role: ${application.role}`,
    `Company: ${application.company.name}`,
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
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
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
  a.download = `${application.company.name}-${stepName}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
