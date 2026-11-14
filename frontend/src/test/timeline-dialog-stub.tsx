import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * A stand-in for `TimelineEventForm` in screen tests (the form is tested on
 * its own): a dialog named by what it does, with Cancel (closes) and Save
 * (closes; in close mode it also refreshes the applications, as the real
 * finalize does — Add event's timeline hooks refresh no list). On
 * unmount it calls `onCloseAutoFocus` the way Radix does when the content
 * leaves, so a screen's focus hand-back runs as in the app.
 */
export function TimelineEventFormStub({
  purpose,
  applicationId,
  onOpenChange,
  onCloseAutoFocus,
}: {
  purpose?: string;
  applicationId: string;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const client = useQueryClient();
  const closeFocus = useRef(onCloseAutoFocus);
  useEffect(() => {
    closeFocus.current = onCloseAutoFocus;
  });
  useEffect(() => {
    const cancel = document.querySelector<HTMLElement>(
      '[data-stub="timeline-cancel"]',
    );
    cancel?.focus();
    return () => closeFocus.current?.(new Event("focus"));
  }, []);
  return (
    <div
      role="dialog"
      aria-label={purpose === "close" ? "Close application" : "Add event"}
      data-application-id={applicationId}
    >
      <button
        type="button"
        data-stub="timeline-cancel"
        onClick={() => onOpenChange(false)}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          if (purpose === "close") {
            void client.invalidateQueries({ queryKey: ["applications"] });
          }
          onOpenChange(false);
        }}
      >
        Save
      </button>
    </div>
  );
}
