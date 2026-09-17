"use client";

import type { ComponentType, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideProps } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * The open/close seam every collapsible CV surface exposes.
 *
 * Radix semantics, unchanged: give `defaultOpen` alone and the component owns
 * its state; give `open` + `onOpenChange` and the caller does. The CV form
 * drives the CONTROLLED pair so a section holding a validation error can be
 * forced open on submit — a hidden error is not an error the user can fix.
 */
export interface CvCollapsibleProps {
  /** Set false for a section that must never fold away. Defaults to true. */
  collapsible?: boolean;
  /** Uncontrolled initial state. Defaults to OPEN: the page opens expanded. */
  defaultOpen?: boolean;
  /** Controlled open state. Pair it with `onOpenChange`. */
  open?: boolean;
  /** Fired with the next state on every trigger press. */
  onOpenChange?: (open: boolean) => void;
}

export interface CvSectionCardProps extends CvCollapsibleProps {
  /** Section title. Rendered as the heading given by `as`. */
  title: string;
  /** Supporting copy under the title. Stays visible while collapsed. */
  description?: ReactNode;
  /** Lucide icon shown in a tinted tile beside the title. */
  icon?: ComponentType<LucideProps>;
  /** Right-aligned header slot (the repeatable sections put their Add button here). */
  action?: ReactNode;
  /** Heading level, so the page outline stays correct. */
  as?: "h2" | "h3";
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

/** The disclosure animation. `tw-animate-css` ships both keyframes. */
const COLLAPSIBLE_CONTENT_CLASS = cn(
  "overflow-hidden",
  "data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down",
  "motion-reduce:animate-none",
);

/**
 * Card shell for one titled block of the CV editor: tinted icon tile, heading,
 * description, an optional header action and the fields underneath. Shell only
 * — the caller owns the `<form>` and the fields.
 *
 * The heading IS the disclosure button (the WAI-ARIA accordion shape: a heading
 * whose only child is the trigger), which is why the header's `action` slot is
 * a SIBLING of it and not inside it — the Add button of a repeatable section
 * may never be nested in the trigger that would swallow its click. The
 * description stays outside the button too: a `<p>` is not phrasing content and
 * cannot live in a `<button>`.
 */
export function CvSectionCard({
  title,
  description,
  icon: Icon,
  action,
  as: Heading = "h2",
  collapsible = true,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
}: CvSectionCardProps) {
  const header = (
    <div className="flex flex-row items-start gap-3 border-b border-border p-4">
      {Icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon aria-hidden className="size-4.5" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">
        <Heading className="font-display text-base leading-none font-semibold tracking-tight">
          {collapsible ? (
            <CollapsibleTrigger
              data-slot="cv-section-trigger"
              className={cn(
                "group flex w-full items-center justify-between gap-2 rounded-sm text-left",
                "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                "cursor-pointer hover:text-primary",
              )}
            >
              <span className="min-w-0 truncate">{title}</span>
              <ChevronDown
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=closed]:-rotate-90"
              />
            </CollapsibleTrigger>
          ) : (
            title
          )}
        </Heading>
        {description ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );

  const body = <div className={cn("p-4", contentClassName)}>{children}</div>;

  return (
    <Card
      data-slot="cv-section"
      className={cn("gap-0 overflow-hidden py-0", className)}
    >
      {collapsible ? (
        <Collapsible
          defaultOpen={open === undefined ? defaultOpen : undefined}
          open={open}
          onOpenChange={onOpenChange}
        >
          {header}
          <CollapsibleContent
            data-slot="cv-section-content"
            className={COLLAPSIBLE_CONTENT_CLASS}
          >
            {body}
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <>
          {header}
          {body}
        </>
      )}
    </Card>
  );
}

export { COLLAPSIBLE_CONTENT_CLASS as CV_COLLAPSIBLE_CONTENT_CLASS };
