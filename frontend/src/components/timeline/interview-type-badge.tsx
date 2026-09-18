import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_INTERVIEW_TYPE,
  INTERVIEW_TYPE_LABELS,
} from "@/components/timeline/timeline-options";
import { type InterviewType } from "@/components/timeline/timeline-types";

interface InterviewTypeBadgeProps {
  /** The interview type; `null`/absent reads as `unknown`. */
  type?: InterviewType | null;
  className?: string;
}

/**
 * Outline pill naming an interview's type, set beside the `Interview`
 * `EventTypeBadge`. Presentational.
 */
export function InterviewTypeBadge({
  type,
  className,
}: InterviewTypeBadgeProps) {
  return (
    <Badge variant="outline" className={className}>
      <span className="sr-only">Interview type: </span>
      {INTERVIEW_TYPE_LABELS[type ?? DEFAULT_INTERVIEW_TYPE]}
    </Badge>
  );
}
