import { Archive, Flag } from "lucide-react";

import {
  TAILORED_CV_READ_ONLY_COPY,
  type TailoredCvReadOnlyReason,
} from "@/components/tailored-cvs/types";
import { cn } from "@/lib/utils";

export interface TailoredCvReadOnlyBannerProps {
  /** Which fact about the application locked the copy. */
  reason: TailoredCvReadOnlyReason;
  className?: string;
}

/**
 * Says why this CV copy cannot be changed, in the two cases that lock it: the
 * application is finalized, or it belongs to a closed cycle. The wording differs
 * per reason on purpose — "read-only" alone would leave the user guessing which
 * of the two applies and what, if anything, they can do about it.
 *
 * `role="status"` rather than `role="alert"`: this is the state of the page, not
 * an error, so it is announced without interrupting.
 */
export function TailoredCvReadOnlyBanner({
  reason,
  className,
}: TailoredCvReadOnlyBannerProps) {
  const { title, body } = TAILORED_CV_READ_ONLY_COPY[reason];
  const Icon = reason === "finalized" ? Flag : Archive;

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-muted/60 p-3 text-sm sm:gap-4 sm:p-4",
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-display leading-tight font-semibold">{title}</p>
        <p className="text-xs text-pretty text-muted-foreground sm:text-sm">
          {body}
        </p>
      </div>
    </div>
  );
}
