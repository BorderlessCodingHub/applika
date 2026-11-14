"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { TimelineEventForm } from "@/components/timeline/timeline-event-form";
import { useTimeline } from "@/hooks/use-timeline";
import { toTimelineEventViews } from "@/lib/timeline-view";

export interface PhoneTimelineDialogProps {
  applicationId: string;
  /** `event`: "Log update" (today's Add event). `close`: "Close it" / "Close" (today's close mode). */
  purpose: "event" | "close";
  onOpenChange: (open: boolean) => void;
  /**
   * The button that opened the dialog, found when it mounts (Safari does not
   * focus a tapped button, so the focused element cannot tell).
   */
  opener: () => HTMLElement | null;
  /**
   * Where focus goes when the control that opened the dialog is gone, or
   * leaves soon after (a closed application's Close, a card leaving Today's
   * attention list): the screen's next best place.
   */
  fallbackFocus: () => HTMLElement | null;
}

/** How long after closing a removed opener still sends focus to the fallback. */
const SETTLE_MS = 5000;

/**
 * Hands focus back to `opener` and, should it leave the page while it still
 * holds focus (the list it sat in refetched), to `fallback`. A dialog
 * mounted already open has no Radix trigger, which would drop focus on
 * `<body>`.
 */
function returnFocus(
  opener: HTMLElement | null,
  fallback: () => HTMLElement | null,
) {
  const usable = (element: HTMLElement | null) =>
    element !== null && element !== document.body && element.isConnected;
  if (!usable(opener)) {
    fallback()?.focus({ preventScroll: true });
    return;
  }
  opener!.focus({ preventScroll: true });
  const observer = new MutationObserver(() => {
    if (opener!.isConnected) return;
    observer.disconnect();
    window.clearTimeout(timer);
    const active = document.activeElement;
    if (!active || active === document.body) {
      fallback()?.focus({ preventScroll: true });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timer = window.setTimeout(() => observer.disconnect(), SETTLE_MS);
}

/**
 * Today's timeline event dialog, open, for a phone screen's Log update and
 * Close: the same `TimelineEventForm` the desktop row mounts, never a fork.
 * Add event reads the application's events (cached under the timeline key)
 * so R-030 holds: a second initial screening stays disabled. On close,
 * focus goes back to the button that opened it, else to `fallbackFocus`.
 */
export function PhoneTimelineDialog({
  applicationId,
  purpose,
  onOpenChange,
  opener: findOpener,
  fallbackFocus,
}: PhoneTimelineDialogProps) {
  const client = useQueryClient();
  const timeline = useTimeline(purpose === "event" ? applicationId : null);
  // Read once, as the dialog mounts: the button that opened it.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : findOpener(),
  );
  return (
    <TimelineEventForm
      applicationId={applicationId}
      open
      purpose={purpose}
      onOpenChange={(open) => {
        // A saved event moves the list's `last_step` (stage, Stale, "Denied",
        // Today's attention), which the timeline hooks do not refresh: the
        // phone reads it, so the list is asked again (after Cancel too:
        // harmless). Close already refreshes it through finalize.
        if (!open) {
          void client.invalidateQueries({ queryKey: ["applications"] });
        }
        onOpenChange(open);
      }}
      otherEvents={toTimelineEventViews(timeline.data ?? [])}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocus(opener, fallbackFocus);
      }}
    />
  );
}
