import { useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { TIMELINE_COPY } from "@/components/timeline/timeline-copy";
import {
  DEFAULT_DENIED_REASON,
  DENIED_REASON_LABELS,
} from "@/components/timeline/timeline-options";
import { type DeniedReason } from "@/components/timeline/timeline-types";

interface DeniedReasonBadgeProps {
  /** The reason; `null`/absent reads as `unknown`. */
  reason?: DeniedReason | null;
  className?: string;
}

/**
 * Outline pill naming a denied event's reason, set beside the `Denied`
 * `EventTypeBadge` — the same pairing as `InterviewTypeBadge`. Presentational.
 */
export function DeniedReasonBadge({
  reason,
  className,
}: DeniedReasonBadgeProps) {
  // The labels are read through the module translator: subscribe.
  useLocale();
  return (
    <Badge variant="outline" className={className}>
      <span className="sr-only">{TIMELINE_COPY.deniedReasonLabel}: </span>
      {DENIED_REASON_LABELS[reason ?? DEFAULT_DENIED_REASON]}
    </Badge>
  );
}
