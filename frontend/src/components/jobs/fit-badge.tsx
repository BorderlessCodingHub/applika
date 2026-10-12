import { Badge } from "@/components/ui/badge";
import {
  JOBS_COPY,
  clampFit,
  fitBand,
  fitLabel,
  type FitBand,
} from "@/components/jobs/job-copy";
import { cn } from "@/lib/utils";

// Words carry the score; tint and gauge only repeat it. Text stays `foreground`: tone text on its tint is under 4.5:1 in light.
const BAND_CLASS: Record<FitBand, { pill: string; arc: string }> = {
  strong: { pill: "bg-success/10 text-foreground", arc: "stroke-success" },
  partial: { pill: "bg-warning/10 text-foreground", arc: "stroke-warning" },
  low: { pill: "bg-muted text-foreground/70", arc: "stroke-muted-foreground" },
};

const SIZE_CLASS = {
  sm: "h-6 gap-1.5 px-2 text-xs [&>svg]:size-3.5",
  lg: "h-8 gap-2 px-3 text-sm [&>svg]:size-[1.125rem]",
} as const;

const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface FitBadgeProps {
  /** 0..100. `null` renders the "No fit yet" pill (a CV absent from `fits`). */
  score: number | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  id?: string;
}

/** "Fit 72%": the score in words, a band tint and a ring gauge; never colour alone. */
export function FitBadge({ score, size = "sm", className, id }: FitBadgeProps) {
  const sizeClass = SIZE_CLASS[size];

  if (score === null) {
    return (
      <Badge
        id={id}
        variant="outline"
        data-slot="fit-badge"
        data-band="none"
        className={cn(
          "rounded-full border-dashed border-border-strong font-medium text-foreground/70",
          sizeClass,
          className,
        )}
      >
        {JOBS_COPY.noFit}
      </Badge>
    );
  }

  const value = clampFit(score);
  const band = fitBand(value);

  return (
    <Badge
      id={id}
      variant="secondary"
      data-slot="fit-badge"
      data-band={band}
      data-score={value}
      className={cn(
        "rounded-full font-medium tabular-nums",
        BAND_CLASS[band].pill,
        sizeClass,
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="shrink-0 -rotate-90">
        <circle
          cx="8"
          cy="8"
          r={RADIUS}
          fill="none"
          strokeWidth="2.5"
          className="stroke-current opacity-15"
        />
        <circle
          cx="8"
          cy="8"
          r={RADIUS}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap={value > 0 ? "round" : "butt"}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - value / 100)}
          className={BAND_CLASS[band].arc}
        />
      </svg>
      {fitLabel(value)}
    </Badge>
  );
}
