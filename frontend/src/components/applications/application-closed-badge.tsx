import { Lock } from "lucide-react";

import { APPLICATION_CLOSED_LABEL } from "@/components/applications/application-close-copy";
import { Badge } from "@/components/ui/badge";

interface ApplicationClosedBadgeProps {
  /** The application's `finalized_at`. Renders nothing while it is `null`. */
  finalizedAt: string | null | undefined;
  className?: string;
}

/**
 * "Closed" pill for a finalized application, derived purely from `finalizedAt`.
 * The lock matches the timeline's read-only notice, so closed reads by shape
 * and word, not colour. Presentational.
 */
export function ApplicationClosedBadge({
  finalizedAt,
  className,
}: ApplicationClosedBadgeProps) {
  if (finalizedAt == null) return null;

  return (
    <Badge variant="secondary" className={className}>
      <Lock aria-hidden />
      {APPLICATION_CLOSED_LABEL}
    </Badge>
  );
}
