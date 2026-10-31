import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_INTERVIEW_TYPE,
  INTERVIEW_TYPE_LABELS,
} from "@/components/timeline/timeline-options";
import { type InterviewType } from "@/components/timeline/timeline-types";
import { cn } from "@/lib/utils";

interface InterviewTypeBadgeProps {
  /** The interview type; `null`/absent reads as `unknown`. */
  type?: InterviewType | null;
  className?: string;
}

/**
 * Neutral filled pill naming an interview's type, set beside the `Interview`
 * `EventTypeBadge`. Presentational.
 */
export function InterviewTypeBadge({
  type,
  className,
}: InterviewTypeBadgeProps) {
  const t = useTranslations("timeline.form");
  return (
    <Badge
      variant="secondary"
      className={cn("px-2.5 font-semibold", className)}
    >
      <span className="sr-only">{t("interviewType")}: </span>
      {INTERVIEW_TYPE_LABELS[type ?? DEFAULT_INTERVIEW_TYPE]}
    </Badge>
  );
}
