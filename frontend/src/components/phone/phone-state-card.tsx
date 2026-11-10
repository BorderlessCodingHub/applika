"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhoneEmptyCardProps {
  title: ReactNode;
  body?: ReactNode;
  className?: string;
  "data-slot"?: string;
  "data-reason"?: string;
}

/** v3/AdminFeatures' empty card (l.89-92): centred, a 16/600 line and its hint. */
export function PhoneEmptyCard({
  title,
  body,
  className,
  "data-slot": slot,
  "data-reason": reason,
}: PhoneEmptyCardProps) {
  return (
    <div
      data-slot={slot}
      data-reason={reason}
      className={cn("ph-card ph-state-card", className)}
    >
      <p className="ph-state-t">{title}</p>
      {body !== undefined ? <p className="ph-hint ph-state-b">{body}</p> : null}
    </div>
  );
}

export interface PhoneAlertCardProps {
  title: ReactNode;
  body: ReactNode;
  retryLabel: string;
  onRetry?: () => void;
  /** The refetch runs: the button stays focusable (`aria-disabled`, `aria-busy`). */
  retrying?: boolean;
  /** `h1` where the failure is the whole page (a feature that did not load). */
  heading?: "h1" | "h2" | "p";
  className?: string;
  "data-slot"?: string;
}

/** v3/AdminFeatures' failed-load card (l.95-100): what failed, why, and Try again. */
export function PhoneAlertCard({
  title,
  body,
  retryLabel,
  onRetry,
  retrying = false,
  heading: Heading = "p",
  className,
  "data-slot": slot,
}: PhoneAlertCardProps) {
  return (
    <div
      role="alert"
      data-slot={slot}
      className={cn("ph-card ph-alert-card", className)}
    >
      <Heading className="ph-state-t">{title}</Heading>
      <p className="ph-hint ph-alert-b">{body}</p>
      {onRetry ? (
        // aria-disabled, never disabled: a disabled button drops focus to <body>.
        <button
          type="button"
          aria-disabled={retrying || undefined}
          aria-busy={retrying || undefined}
          data-action="retry"
          className="ph-btn ph-sec ph-sm"
          onClick={() => {
            if (!retrying) onRetry();
          }}
        >
          {retrying ? (
            <Loader2 size={16} aria-hidden="true" className="ph-spin" />
          ) : null}
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
