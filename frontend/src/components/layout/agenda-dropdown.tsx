"use client";

import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { useAgenda } from "@/hooks/use-user";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, addDays, isToday, isTomorrow } from "date-fns";
import type { AgendaStep } from "@/services/types/applications";
import { getAgendaUrgencyColor } from "@/lib/utils";

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function parseTime(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number);
  return [h, m];
}

function convertToLocalTime(
  dateStr: string,
  timeStr: string,
  fromTz: string,
): string {
  const [h, m] = parseTime(timeStr);
  const fakeDate = new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
  );
  const inSource = new Date(
    fakeDate.toLocaleString("en-US", { timeZone: fromTz }),
  );
  const inLocal = new Date(
    fakeDate.toLocaleString("en-US", { timeZone: getUserTimezone() }),
  );
  const diffMs = inLocal.getTime() - inSource.getTime();
  const converted = new Date(fakeDate.getTime() + diffMs);
  return `${String(converted.getHours()).padStart(2, "0")}:${String(converted.getMinutes()).padStart(2, "0")}`;
}

function getDisplayTime(step: AgendaStep): string | null {
  if (!step.start_time) return null;
  const localTz = getUserTimezone();
  const stepTz = step.timezone;
  const needsConversion = stepTz && stepTz !== localTz;

  const start = needsConversion
    ? convertToLocalTime(step.step_date, step.start_time, stepTz)
    : step.start_time.slice(0, 5);

  if (step.end_time) {
    const end = needsConversion
      ? convertToLocalTime(step.step_date, step.end_time, stepTz)
      : step.end_time.slice(0, 5);
    return `${start} - ${end}`;
  }
  return start;
}

function getUrgencyColor(step: AgendaStep): string {
  const now = new Date();
  let stepDateTime: Date;

  if (step.start_time) {
    const [h, m] = parseTime(step.start_time);
    stepDateTime = new Date(step.step_date + "T00:00:00");
    stepDateTime.setHours(h, m, 0, 0);

    const stepTz = step.timezone;
    const localTz = getUserTimezone();
    if (stepTz && stepTz !== localTz) {
      const inSource = new Date(
        stepDateTime.toLocaleString("en-US", { timeZone: stepTz }),
      );
      const inLocal = new Date(
        stepDateTime.toLocaleString("en-US", { timeZone: localTz }),
      );
      stepDateTime = new Date(
        stepDateTime.getTime() + (inLocal.getTime() - inSource.getTime()),
      );
    }
  } else {
    stepDateTime = new Date(step.step_date + "T00:00:00");
  }

  const diffHours =
    (stepDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  return getAgendaUrgencyColor(diffHours);
}

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

function groupByDate(steps: AgendaStep[]) {
  const groups: Record<string, AgendaStep[]> = {};
  for (const step of steps) {
    const key = step.step_date;
    if (!groups[key]) groups[key] = [];
    groups[key].push(step);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

export function AgendaDropdown() {
  const today = format(new Date(), "yyyy-MM-dd");
  const weekFromNow = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const { data: steps } = useAgenda({
    from_date: today,
    to_date: weekFromNow,
  });

  const upcoming = steps?.filter((s) => s.step_date >= today) ?? [];
  const grouped = groupByDate(upcoming);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <CalendarClock className="h-5 w-5" />
          {upcoming.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {upcoming.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Upcoming Steps</h4>
          <Link
            href="/agenda"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {grouped.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No upcoming steps in the next 7 days
            </div>
          ) : (
            grouped.map(([date, items]) => (
              <div key={date}>
                <div className="sticky top-0 bg-muted/50 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm">
                  {getDayLabel(date)}
                </div>
                {items.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: getUrgencyColor(step) }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {step.company_name}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {step.step_name}
                        </Badge>
                        {getDisplayTime(step) && (
                          <span className="text-xs text-muted-foreground">
                            {getDisplayTime(step)}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground mt-0.5">
                        {step.role}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
