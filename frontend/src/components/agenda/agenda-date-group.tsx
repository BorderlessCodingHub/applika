import { Children, type ReactNode } from "react";

import {
  agendaGroupCountLabel,
  formatAgendaDate,
} from "@/components/agenda/agenda-copy";
import { cn } from "@/lib/utils";

interface AgendaDateGroupProps {
  /** "yyyy-MM-dd", the group's `step_date`. */
  date: string;
  /** Items on this date after search and stage filter. */
  count: number;
  /** One `AgendaItemCard` per item; each is wrapped in an `<li>` here. */
  children: ReactNode;
  className?: string;
}

export function AgendaDateGroup({
  date,
  count,
  children,
  className,
}: AgendaDateGroupProps) {
  return (
    <section
      data-slot="agenda-date-group"
      data-date={date}
      className={cn("@container/agenda-group flex flex-col gap-2", className)}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-muted/70 px-4 py-2 @lg/agenda-group:px-5">
        <h2 className="font-display text-base font-bold text-foreground">
          <time dateTime={date}>{formatAgendaDate(date)}</time>
        </h2>
        <p className="text-sm text-muted-foreground">
          {agendaGroupCountLabel(count)}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {Children.map(children, (child) =>
          child == null ? null : <li>{child}</li>,
        )}
      </ul>
    </section>
  );
}
