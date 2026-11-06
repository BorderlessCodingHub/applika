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
  /** Heading level, so the page outline stays correct. */
  as?: "h2" | "h3";
  /** Non-interactive line under the description (a CV copy's change count); the stretched trigger covers it. */
  status?: ReactNode;
  /** Id of the status wrapper; the trigger is `aria-describedby` it. */
  statusId?: string;
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
 * description and the fields underneath. Shell only — the caller owns the
 * `<form>` and the fields.
 *
 * **The WHOLE header toggles the section.** The owner, KODI-009: "remove the
 * button to insert a new link/category/etc from the category header and put
 * inside the colapsable section". With nothing else competing for the header
 * there is no reason to make the user aim at the title, so the header is one
 * hit area — and the card carries NO header action slot any more. Do not add
 * one back: a second interactive control in this header would be unreachable
 * under the stretched trigger.
 *
 * It is stretched with a PSEUDO-ELEMENT (`after:absolute after:inset-0` over
 * the `relative` header), not by growing the `<button>` around the rest of the
 * header. That keeps three things at once: the WAI-ARIA accordion shape (a
 * heading whose only child is the trigger), an accessible name that is exactly
 * the title — every locator in the suite matches it EXACTLY — and a `<p>` for
 * the description, which is not phrasing content and could not live inside a
 * `<button>`. The focus ring therefore goes on the header, as an inset
 * `outline`: a `ring` is painted outside the border box and the card's
 * `overflow-hidden` would clip it.
 *
 * The header row is `items-center`, so the chevron sits on the vertical axis of
 * the whole header block rather than on the first line of a two-line one — the
 * owner again: "align the chevron icons to the center vercially of the
 * component".
 */
export function CvSectionCard({
  title,
  description,
  icon: Icon,
  as: Heading = "h2",
  status,
  statusId,
  collapsible = true,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
}: CvSectionCardProps) {
  const hasStatus = status !== undefined && status !== null && status !== false;

  const header = (
    <div
      data-slot="cv-section-header"
      className={cn(
        // `relative` is what bounds the trigger's stretched `::after`. With
        // `z-index: auto` it creates NO stacking context, so the shell's
        // z-30/40/50 contract is untouched (frontend/CLAUDE.md).
        "relative flex flex-row items-center gap-3 border-b border-border p-4",
        collapsible && [
          "cursor-pointer",
          "has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2",
          "has-[:focus-visible]:outline-ring/50",
        ],
      )}
    >
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
              aria-describedby={hasStatus ? statusId : undefined}
              className={cn(
                "block w-full rounded-sm text-left outline-none",
                "cursor-pointer hover:text-primary",
                // The hit area, stretched over the whole header. Hovering the
                // pseudo-element hovers the trigger, so `hover:text-primary`
                // answers to the header and not just to the words.
                "after:absolute after:inset-0 after:content-['']",
              )}
            >
              <span className="block leading-tight break-words">{title}</span>
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
        {hasStatus ? (
          <div id={statusId} data-slot="cv-section-status" className="pt-1">
            {status}
          </div>
        ) : null}
      </div>
      {collapsible ? (
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
            "group-data-[state=closed]/cv-section:-rotate-90",
          )}
        />
      ) : null}
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
          // The chevron lives at HEADER level now, outside the trigger, so it
          // reads the open state off the Root rather than off its old parent.
          className="group/cv-section"
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
