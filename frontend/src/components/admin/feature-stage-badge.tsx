import {
  FEATURE_COPY,
  useFeatureCopyLocale,
} from "@/components/admin/feature-copy";
import { BetaBadge } from "@/components/features/beta-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FeatureStage } from "@/services/types/features";

export interface FeatureStageBadgeProps {
  stage: FeatureStage;
  className?: string;
}

/** The stage in words: "Beta" (the same chip users see) or "General". Text stays `foreground` on both tints. */
export function FeatureStageBadge({
  stage,
  className,
}: FeatureStageBadgeProps) {
  useFeatureCopyLocale();
  if (stage === "beta") {
    return <BetaBadge data-stage="beta" className={className} />;
  }
  return (
    <Badge
      variant="outline"
      data-slot="feature-stage"
      data-stage="general"
      className={cn(
        "h-6 gap-1.5 rounded-full border-success/40 bg-success/10 px-2.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      {FEATURE_COPY.stage.general}
    </Badge>
  );
}
