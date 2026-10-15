"use client";

import { useId, useRef } from "react";
import { CircleCheck, CircleX } from "lucide-react";

import { Button, LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  DEVICE_SIGN_IN_COPY,
  type DeviceOutcomeKind,
} from "./device-sign-in-copy";
import { useFocusIfLost } from "./use-focus-if-lost";

export interface DeviceOutcomeProps {
  outcome: DeviceOutcomeKind;
  /** Denied only: back to an empty code form. */
  onStartOver?: () => void;
  className?: string;
}

export function DeviceOutcome({
  outcome,
  onStartOver,
  className,
}: DeviceOutcomeProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const approved = outcome === "approved";
  const Icon = approved ? CircleCheck : CircleX;
  useFocusIfLost(headingRef);

  return (
    <section
      aria-labelledby={headingId}
      data-slot="device-outcome"
      data-outcome={outcome}
      className={cn(
        "flex flex-col items-center gap-4 rounded-xl bg-card px-5 py-8 text-center shadow-card sm:px-8",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          approved
            ? "bg-success/10 text-success ring-1 ring-success/25"
            : "bg-muted text-muted-foreground ring-1 ring-border",
        )}
      >
        <Icon className="size-6" />
      </span>
      <h2
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className="max-w-sm text-base font-semibold text-balance text-foreground outline-none"
      >
        {approved ? DEVICE_SIGN_IN_COPY.approved : DEVICE_SIGN_IN_COPY.denied}
      </h2>
      {approved ? (
        <LinkButton href={DEVICE_SIGN_IN_COPY.devicesHref} variant="outline">
          {DEVICE_SIGN_IN_COPY.seeDevices}
        </LinkButton>
      ) : onStartOver ? (
        <Button type="button" variant="outline" onClick={onStartOver}>
          {DEVICE_SIGN_IN_COPY.anotherCode}
        </Button>
      ) : null}
    </section>
  );
}
