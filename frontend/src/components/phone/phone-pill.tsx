import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PhonePillTone = "ok" | "warn" | "bad" | "pri";

const TONE_CLASS: Record<PhonePillTone, string> = {
  ok: "ph-ok",
  warn: "ph-warn",
  bad: "ph-bad",
  pri: "ph-pri",
};

export interface PhonePillProps {
  /** None is the muted pill. */
  tone?: PhonePillTone;
  /** The `.ph-dot` colour, e.g. `var(--warning)`. */
  dot?: string;
  id?: string;
  className?: string;
  children: ReactNode;
}

export function PhonePill({
  tone,
  dot,
  id,
  className,
  children,
}: PhonePillProps) {
  return (
    <span
      id={id}
      data-slot="phone-pill"
      className={cn("ph-pill", tone && TONE_CLASS[tone], className)}
    >
      {dot ? (
        <span
          className="ph-dot"
          style={{ background: dot }}
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}
