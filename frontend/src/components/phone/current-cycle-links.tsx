"use client";

import type { MouseEvent, ReactNode } from "react";

import { useCycleContext } from "@/contexts/cycle-context";
import { useApplications } from "@/hooks/use-applications";

/**
 * Today and the Agenda list interviews of every application (the agenda is
 * not cycle-scoped). A tap on one of their `/applications?focus=<id>` links
 * while an archived cycle is viewed views the current cycle again first —
 * only when the id IS in the current cycle (`useApplications(null)`, the
 * list Today already reads), so an archived application's interview still
 * opens on its archive. No box of its own (`display: contents`).
 */
export function OpensOnCurrentCycle({ children }: { children: ReactNode }) {
  const { isViewingPastCycle, setSelectedCycleId } = useCycleContext();
  const { applications } = useApplications(null);
  return (
    <div
      className="contents"
      onClickCapture={(event: MouseEvent<HTMLDivElement>) => {
        if (!isViewingPastCycle) return;
        const target = event.target as Element | null;
        const link = target?.closest?.<HTMLAnchorElement>(
          'a[href^="/applications?focus="]',
        );
        if (!link) return;
        const id = new URL(link.href, window.location.origin).searchParams.get(
          "focus",
        );
        if (applications?.some((app) => app.id === id)) {
          setSelectedCycleId(null);
        }
      }}
    >
      {children}
    </div>
  );
}
