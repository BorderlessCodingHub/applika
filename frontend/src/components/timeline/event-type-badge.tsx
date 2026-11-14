import { useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { EVENT_TYPE_CONFIG } from "@/components/timeline/timeline-options";
import { type TimelineEventType } from "@/components/timeline/timeline-types";
import { cn } from "@/lib/utils";

interface EventTypeBadgeProps {
  /** The event type whose icon + accent + label to render. */
  type: TimelineEventType;
  /** Hide the leading icon (label-only pill). Defaults to `false`. */
  hideIcon?: boolean;
  className?: string;
}

/**
 * Tinted pill for a timeline event type: leading Lucide icon + label, coloured
 * from the type's accent (existing semantic tokens). Status is conveyed by icon
 * + label + colour together, never colour alone. Presentational.
 */
export function EventTypeBadge({
  type,
  hideIcon = false,
  className,
}: EventTypeBadgeProps) {
  // The label is read through the module translator: subscribe.
  useLocale();
  const { label, icon: Icon, badgeClass } = EVENT_TYPE_CONFIG[type];

  return (
    <Badge className={cn("gap-1", badgeClass, className)}>
      {hideIcon ? null : <Icon aria-hidden />}
      {label}
    </Badge>
  );
}
