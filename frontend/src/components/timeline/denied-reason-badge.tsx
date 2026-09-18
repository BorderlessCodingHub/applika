import { Badge } from "@/components/ui/badge";
import { DENIED_REASON_FIELD_LABEL } from "@/components/timeline/timeline-copy";
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
  return (
    <Badge variant="outline" className={className}>
      <span className="sr-only">{DENIED_REASON_FIELD_LABEL}: </span>
      {DENIED_REASON_LABELS[reason ?? DEFAULT_DENIED_REASON]}
    </Badge>
  );
}
