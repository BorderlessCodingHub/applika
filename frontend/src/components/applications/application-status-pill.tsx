import { type ComponentType } from "react";
import { type LucideProps } from "lucide-react";

import { APPLICATION_STATUS_SR_PREFIX } from "@/components/applications/application-card-copy";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ApplicationStatusTone = "success" | "neutral" | "destructive";

// Text stays neutral on the destructive tone: text-destructive on its own tint is under 4.5:1 in dark.
const TONE_CLASS: Record<ApplicationStatusTone, { pill: string; dot: string }> =
  {
    success: { pill: "bg-success/10 text-success", dot: "bg-success" },
    neutral: {
      pill: "bg-muted text-foreground/70",
      dot: "bg-muted-foreground",
    },
    destructive: {
      pill: "bg-destructive/10 text-foreground/80",
      dot: "bg-destructive",
    },
  };

interface ApplicationStatusPillProps {
  label: string;
  tone?: ApplicationStatusTone;
  icon?: ComponentType<LucideProps>;
  className?: string;
}

export function ApplicationStatusPill({
  label,
  tone = "neutral",
  icon: Icon,
  className,
}: ApplicationStatusPillProps) {
  const { pill, dot } = TONE_CLASS[tone];

  return (
    <Badge
      data-slot="application-status-pill"
      data-tone={tone}
      className={cn(
        "h-8 gap-2 rounded-lg px-3 py-0 text-sm [&>svg]:size-3.5",
        pill,
        className,
      )}
    >
      {Icon ? (
        <Icon aria-hidden />
      ) : (
        <span aria-hidden className={cn("size-2 rounded-full", dot)} />
      )}
      <span className="sr-only">{APPLICATION_STATUS_SR_PREFIX}: </span>
      {label}
    </Badge>
  );
}
