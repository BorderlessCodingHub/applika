"use client";

import { useTranslations } from "next-intl";
import { clampFit, fitBand, type FitBand } from "@/components/jobs/job-copy";
import { cn } from "@/lib/utils";

/** The band's arc on both rings (v2/Jobs, v2/JobDetail); words carry the score, colour repeats it. */
const ARC: Record<FitBand, string> = {
  strong: "var(--success)",
  partial: "var(--warning)",
  low: "var(--muted-foreground)",
};

const BAND_CLASS: Record<FitBand, string> = {
  strong: "ph-strong",
  partial: "ph-partial",
  low: "ph-low",
};

function dash(score: number, radius: number): string {
  const circumference = 2 * Math.PI * radius;
  return `${((circumference * score) / 100).toFixed(2)} ${circumference.toFixed(2)}`;
}

export interface PhoneFitPillProps {
  /** 0..100, rounded and clamped; render no pill for a job with no fit. */
  score: number;
  id?: string;
  className?: string;
}

/** v2/Jobs' `.fit` pill: a 14px ring and "Fit 82%", tinted by band (>= 70, >= 40, below). */
export function PhoneFitPill({ score, id, className }: PhoneFitPillProps) {
  const t = useTranslations("jobs");
  const value = clampFit(score);
  const band = fitBand(value);
  return (
    <span
      id={id}
      data-slot="fit-badge"
      data-band={band}
      data-score={value}
      className={cn("ph-fit", BAND_CLASS[band], className)}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth="2.5"
        />
        {value > 0 ? (
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            stroke={ARC[band]}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={dash(value, 6)}
            transform="rotate(-90 8 8)"
          />
        ) : null}
      </svg>
      {t("fitLabel", { score: value })}
    </span>
  );
}

export interface PhoneFitRingProps {
  score: number;
  className?: string;
}

/** v2/JobDetail's 56px ring (stroke 7, track `--muted`), named "Fit 82%". */
export function PhoneFitRing({ score, className }: PhoneFitRingProps) {
  const t = useTranslations("jobs");
  const value = clampFit(score);
  const band = fitBand(value);
  return (
    <svg
      width="56"
      height="56"
      viewBox="0 0 56 56"
      role="img"
      aria-label={t("fitLabel", { score: value })}
      data-slot="fit-ring"
      data-band={band}
      data-score={value}
      className={cn("ph-jd-ring", className)}
    >
      <circle
        cx="28"
        cy="28"
        r="23"
        fill="none"
        stroke="var(--muted)"
        strokeWidth="7"
      />
      {value > 0 ? (
        <circle
          cx="28"
          cy="28"
          r="23"
          fill="none"
          stroke={ARC[band]}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={dash(value, 23)}
          transform="rotate(-90 28 28)"
        />
      ) : null}
    </svg>
  );
}
