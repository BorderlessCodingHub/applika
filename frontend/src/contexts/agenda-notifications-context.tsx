"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { AgendaStep } from "@/services/types/applications";
import { useAgenda } from "@/hooks/use-user";

const STORAGE_KEY = "agenda-notifications";
const ALERT_MINUTES = [30, 15, 5] as const;

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

function getStepLocalDateTime(step: AgendaStep): Date | null {
  if (!step.start_time) return null;

  const [h, m] = step.start_time.split(":").map(Number);
  const dt = new Date(step.step_date + "T00:00:00");
  dt.setHours(h, m, 0, 0);

  const stepTz = step.timezone;
  const localTz = getUserTimezone();
  if (stepTz && stepTz !== localTz) {
    const inSource = new Date(dt.toLocaleString("en-US", { timeZone: stepTz }));
    const inLocal = new Date(dt.toLocaleString("en-US", { timeZone: localTz }));
    const diffMs = inLocal.getTime() - inSource.getTime();
    return new Date(dt.getTime() + diffMs);
  }

  return dt;
}

function readEnabled(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeEnabled(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

function playAlert() {
  const audio = new Audio("/sounds/alert.mp3");
  audio.play().catch(() => {});
}

interface AgendaNotificationsContextValue {
  toggle: (stepId: string) => void;
  isEnabled: (stepId: string) => boolean;
}

const AgendaNotificationsContext =
  createContext<AgendaNotificationsContextValue | null>(null);

export function AgendaNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { data: steps } = useAgenda();
  const [enabledIds, setEnabledIds] = useState<Set<string>>(() =>
    readEnabled(),
  );
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Sync state → localStorage
  useEffect(() => {
    writeEnabled(enabledIds);
  }, [enabledIds]);

  // Schedule timers whenever enabled set or steps change
  useEffect(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];

    if (!steps) return;

    const now = Date.now();

    for (const step of steps) {
      if (!enabledIds.has(step.id)) continue;

      const startDt = getStepLocalDateTime(step);
      if (!startDt) continue;

      const startMs = startDt.getTime();

      for (const minBefore of ALERT_MINUTES) {
        const fireAt = startMs - minBefore * 60_000;
        const delay = fireAt - now;

        if (delay > 0) {
          const timer = setTimeout(() => {
            playAlert();
            if (
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              new Notification(
                `${step.company_name} — ${step.step_name ?? "Step"}`,
                { body: `Starts in ${minBefore} minutes` },
              );
            }
          }, delay);
          timersRef.current.push(timer);
        }
      }
    }

    return () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
  }, [enabledIds, steps]);

  const toggle = useCallback((stepId: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "default"
        ) {
          Notification.requestPermission();
        }
      }
      return next;
    });
  }, []);

  const isEnabled = useCallback(
    (stepId: string) => enabledIds.has(stepId),
    [enabledIds],
  );

  return (
    <AgendaNotificationsContext.Provider value={{ toggle, isEnabled }}>
      {children}
    </AgendaNotificationsContext.Provider>
  );
}

export function useAgendaNotifications() {
  const ctx = useContext(AgendaNotificationsContext);
  if (!ctx) {
    throw new Error(
      "useAgendaNotifications must be used within AgendaNotificationsProvider",
    );
  }
  return ctx;
}
