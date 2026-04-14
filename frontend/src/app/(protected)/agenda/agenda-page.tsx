"use client";

import { useAgenda } from "@/hooks/use-user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bell,
  BellRing,
  CalendarClock,
  CalendarPlus,
  Clock,
  Globe,
  StickyNote,
  Briefcase,
} from "lucide-react";
import { format, isToday, isTomorrow, addDays } from "date-fns";
import type { AgendaStep } from "@/services/types/applications";
import { genAgendaStepIcsFile } from "@/lib/calendar";
import { toast } from "sonner";
import Link from "next/link";
import { cn, getAgendaUrgencyColor } from "@/lib/utils";
import { useAgendaNotifications } from "@/contexts/agenda-notifications-context";

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

/** Parse "HH:MM" or "HH:MM:SS" into [hours, minutes] */
function parseTime(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number);
  return [h, m];
}

/**
 * Convert a time string from one timezone to the local system timezone.
 * Returns the converted "HH:MM" string.
 */
function convertToLocalTime(
  dateStr: string,
  timeStr: string,
  fromTz: string,
): string {
  const [h, m] = parseTime(timeStr);
  // Build a date in the step's timezone using Intl formatting
  const fakeDate = new Date(`${dateStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);

  // Get the offset difference by formatting in both timezones
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

/** Get the display time, converting timezone if needed */
function getDisplayTime(step: AgendaStep): {
  time: string;
  endTime?: string;
  converted: boolean;
} | null {
  if (!step.start_time) return null;

  const localTz = getUserTimezone();
  const stepTz = step.timezone;
  const needsConversion = stepTz && stepTz !== localTz;

  const time = needsConversion
    ? convertToLocalTime(step.step_date, step.start_time, stepTz)
    : step.start_time.slice(0, 5);

  const endTime = step.end_time
    ? needsConversion
      ? convertToLocalTime(step.step_date, step.end_time, stepTz)
      : step.end_time.slice(0, 5)
    : undefined;

  return { time, endTime, converted: !!needsConversion };
}

/**
 * Returns the urgency color based on how many hours until the step.
 * Past steps and steps >12h away: gray
 * <12h: blue, <6h: yellow, <3h: orange, <1h: red
 */
function getUrgencyColor(step: AgendaStep): string {
  const now = new Date();

  let stepDateTime: Date;
  if (step.start_time) {
    const [h, m] = parseTime(step.start_time);
    stepDateTime = new Date(step.step_date + "T00:00:00");
    stepDateTime.setHours(h, m, 0, 0);

    // Convert from step timezone to local if needed
    const stepTz = step.timezone;
    const localTz = getUserTimezone();
    if (stepTz && stepTz !== localTz) {
      const inSource = new Date(
        stepDateTime.toLocaleString("en-US", { timeZone: stepTz }),
      );
      const inLocal = new Date(
        stepDateTime.toLocaleString("en-US", { timeZone: localTz }),
      );
      const diffMs = inLocal.getTime() - inSource.getTime();
      stepDateTime = new Date(stepDateTime.getTime() + diffMs);
    }
  } else {
    // No time set — use start of day
    stepDateTime = new Date(step.step_date + "T00:00:00");
  }

  const diffMs = stepDateTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return getAgendaUrgencyColor(diffHours);
}

interface Section {
  title: string;
  steps: AgendaStep[];
}

function isStepPast(step: AgendaStep, now: Date): boolean {
  const today = format(now, "yyyy-MM-dd");

  if (step.step_date < today) return true;
  if (step.step_date > today) return false;

  // Today's step: if it has a start_time, check if that time has passed
  if (step.start_time) {
    const [h, m] = parseTime(step.start_time);
    const stepDt = new Date(step.step_date + "T00:00:00");
    stepDt.setHours(h, m, 0, 0);

    const stepTz = step.timezone;
    const localTz = getUserTimezone();
    if (stepTz && stepTz !== localTz) {
      const inSource = new Date(
        stepDt.toLocaleString("en-US", { timeZone: stepTz }),
      );
      const inLocal = new Date(
        stepDt.toLocaleString("en-US", { timeZone: localTz }),
      );
      const diffMs = inLocal.getTime() - inSource.getTime();
      return new Date(stepDt.getTime() + diffMs) < now;
    }

    return stepDt < now;
  }

  // No time set — consider entire day, not past until day is over
  return false;
}

function categorizeSteps(steps: AgendaStep[]): Section[] {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");

  const sections: Section[] = [
    { title: "Today", steps: [] },
    { title: "Tomorrow", steps: [] },
    { title: "Upcoming", steps: [] },
    { title: "Past", steps: [] },
  ];

  for (const step of steps) {
    if (isStepPast(step, now)) {
      sections[3].steps.push(step);
    } else if (step.step_date === today) {
      sections[0].steps.push(step);
    } else if (step.step_date === tomorrow) {
      sections[1].steps.push(step);
    } else {
      sections[2].steps.push(step);
    }
  }

  return sections.filter((s) => s.steps.length > 0);
}

function StepCard({
  step,
  notificationEnabled,
  onToggleNotification,
  isPast,
}: {
  step: AgendaStep;
  notificationEnabled: boolean;
  onToggleNotification: () => void;
  isPast: boolean;
}) {
  const date = new Date(step.step_date + "T00:00:00");
  const showFullDate = !isToday(date) && !isTomorrow(date);
  const urgencyColor = getUrgencyColor(step);
  const displayTime = getDisplayTime(step);

  function handleCalendarExport() {
    genAgendaStepIcsFile(step);
    toast.success("Calendar event downloaded");
  }

  return (
    <Card className="transition-colors hover:bg-accent/30">
      <CardContent className="flex gap-4 p-4">
        <div className="flex flex-col items-center gap-1 pt-0.5">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: urgencyColor }}
          />
          {displayTime && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[11px] font-medium text-muted-foreground">
                  {displayTime.time}
                </span>
              </TooltipTrigger>
              {displayTime.converted && step.timezone && (
                <TooltipContent>
                  <p className="text-xs">
                    {step.start_time!.slice(0, 5)} in {step.timezone.replace(/_/g, " ")}
                  </p>
                </TooltipContent>
              )}
            </Tooltip>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold leading-tight">{step.company_name}</p>
              <p className="text-sm text-muted-foreground">{step.role}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge
                variant="secondary"
                style={{
                  borderColor: step.step_color ?? undefined,
                  borderWidth: step.step_color ? 1 : undefined,
                }}
              >
                {step.step_name}
              </Badge>
              {step.start_time && !isPast && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-7 w-7",
                        notificationEnabled && "text-primary",
                      )}
                      onClick={onToggleNotification}
                    >
                      {notificationEnabled ? (
                        <BellRing className="h-3.5 w-3.5" />
                      ) : (
                        <Bell className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {notificationEnabled
                      ? "Disable sound alerts"
                      : "Alert at 30, 15 & 5 min before"}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleCalendarExport}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add to calendar</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {showFullDate && (
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" />
                {format(date, "MMM d, yyyy")}
              </span>
            )}
            {displayTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {displayTime.time}
                {displayTime.endTime && ` - ${displayTime.endTime}`}
                {displayTime.converted && (
                  <span className="text-[10px] opacity-60">(converted)</span>
                )}
              </span>
            )}
            {step.timezone && (
              <span className="flex items-center gap-1">
                <Globe className="h-3 w-3" />
                {step.timezone.replace(/_/g, " ")}
              </span>
            )}
          </div>

          {step.observation && (
            <div className="flex gap-1.5 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <p className="whitespace-pre-wrap">{step.observation}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionBlock({
  section,
  isNotificationEnabled,
  onToggleNotification,
  isPast,
}: {
  section: Section;
  isNotificationEnabled: (id: string) => boolean;
  onToggleNotification: (id: string) => void;
  isPast: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{section.title}</h2>
        <Badge variant="outline" className="text-xs">
          {section.steps.length}
        </Badge>
      </div>
      <div className="space-y-2">
        {section.steps.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            notificationEnabled={isNotificationEnabled(step.id)}
            onToggleNotification={() => onToggleNotification(step.id)}
            isPast={isPast}
          />
        ))}
      </div>
    </div>
  );
}

function AgendaSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-24" />
          {[1, 2].map((j) => (
            <Skeleton key={j} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function AgendaPage() {
  const { data: steps, isLoading } = useAgenda();
  const { toggle, isEnabled } = useAgendaNotifications();

  const sections = steps ? categorizeSteps(steps) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarClock className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">
            Your application steps organized by date
          </p>
        </div>
      </div>

      {isLoading ? (
        <AgendaSkeleton />
      ) : sections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <CalendarClock className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">No steps scheduled</p>
            <Link
              href="/applications"
              className="flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <Briefcase className="h-4 w-4" />
              Go to Applications
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <SectionBlock
              key={section.title}
              section={section}
              isNotificationEnabled={isEnabled}
              onToggleNotification={toggle}
              isPast={section.title === "Past"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
