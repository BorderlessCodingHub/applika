"use client";

import { useId } from "react";
import { FilePlus2 } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { BASE_CVS_MAX } from "@/components/base-cvs/types";
import { cn } from "@/lib/utils";

/**
 * Default on-screen reason when the cap is reached. It carries the words
 * "the limit is three" verbatim, which AC2 requires to be visible.
 */
export const BASE_CV_LIMIT_REASON =
  "You already have 3 master CVs — the limit is three. Delete one to create another.";

export interface NewCvCardProps {
  /** Destination for the create action. */
  href: string;
  /** How many master CVs the user already has. */
  count: number;
  /** The cap. Defaults to `BASE_CVS_MAX`. */
  max?: number;
  /** Why creating is refused, shown on screen in the disabled state. */
  reason?: string;
  className?: string;
}

/**
 * The dashed "create" tile that closes the CV gallery. It has two states: a
 * link when a slot is free, and a disabled button plus a visible reason once
 * the cap is reached. The reason is real text tied to the button with
 * `aria-describedby`, never a tooltip or a `title`.
 */
export function NewCvCard({
  href,
  count,
  max = BASE_CVS_MAX,
  reason = BASE_CV_LIMIT_REASON,
  className,
}: NewCvCardProps) {
  const reasonId = useId();
  const remaining = Math.max(0, max - count);
  const atLimit = remaining === 0;

  return (
    <div
      className={cn(
        "flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border p-6 text-center transition-colors",
        atLimit ? "bg-surface/40" : "bg-surface/40 hover:border-primary/50",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <FilePlus2
          aria-hidden
          className={cn(
            "size-4",
            atLimit ? "text-muted-foreground/60" : "text-primary",
          )}
        />
      </span>

      {atLimit ? (
        <>
          <p
            id={reasonId}
            className="max-w-xs text-sm text-pretty text-muted-foreground"
          >
            {reason}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            aria-describedby={reasonId}
          >
            New master CV
          </Button>
        </>
      ) : (
        <>
          <p id={reasonId} className="text-sm text-muted-foreground">
            {`${remaining} of ${max} ${remaining === 1 ? "slot" : "slots"} left`}
          </p>
          <LinkButton
            href={href}
            variant="outline"
            size="sm"
            aria-describedby={reasonId}
          >
            New master CV
          </LinkButton>
        </>
      )}
    </div>
  );
}
