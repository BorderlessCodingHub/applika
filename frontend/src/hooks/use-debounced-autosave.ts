"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "idle" | "saving" | "saved" | "error";

export interface UseDebouncedAutosaveOptions<T> {
  /** The latest snapshot to save. A change resets the debounce timer. */
  value: T;
  /** `false` skips saving entirely: no timer, no request. The caller decides
   * whether/when to surface "required" copy from `missingRequired`. */
  isReady: boolean;
  onSave: (value: T) => Promise<void>;
  delayMs?: number;
}

export interface UseDebouncedAutosaveResult {
  status: AutosaveState;
  missingRequired: boolean;
  /** Sends the latest value now, bypassing the debounce. */
  retry: () => void;
}

const DEFAULT_DELAY_MS = 1000;

/**
 * Debounced autosave (PRD 0010, KODI-033): one request in flight, the latest
 * value always wins.
 *
 * The debounce WAIT itself is reported as `"saving"` (never `"idle"` once
 * ready) so `AutosaveStatus` never shows `Saved` over unsaved typing. That
 * flip happens during RENDER, not inside an effect — React's own "adjust
 * state when a prop changes" pattern — because a synchronous `setState`
 * inside a `useEffect` body is a lint error here
 * (`react-hooks/set-state-in-effect`) and, more to the point, would land one
 * tick later than the change it is reporting on.
 *
 * A change that lands while a request is in flight is queued and fires the
 * instant the first settles, with no extra debounce wait — this is what makes
 * "one request in flight, latest payload wins" true even under a fast typist.
 * A failed save keeps `status: "error"`; the very next change (or an explicit
 * `retry()`) sends the CURRENT latest value again.
 *
 * The very first render is never saved — `isReady` can already be `true` when
 * resuming an existing draft, and nothing changed yet to justify a request.
 */
export function useDebouncedAutosave<T>({
  value,
  isReady,
  onSave,
  delayMs = DEFAULT_DELAY_MS,
}: UseDebouncedAutosaveOptions<T>): UseDebouncedAutosaveResult {
  const [status, setStatus] = useState<AutosaveState>("idle");
  // Mirrors `value`/`isReady` in STATE (not a ref) so the comparison below can
  // run during render, per React's documented pattern for adjusting state
  // when a prop changes.
  const [renderedValue, setRenderedValue] = useState(value);
  const [renderedReady, setRenderedReady] = useState(isReady);

  const [firstRender, setFirstRender] = useState(true);
  const latestValue = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);
  const pending = useRef(false);
  const onSaveRef = useRef(onSave);
  const mounted = useRef(true);
  const firstEffect = useRef(true);

  useEffect(() => {
    onSaveRef.current = onSave;
  });

  // Refs are write-only outside render; keep the latest value available to
  // the async callbacks (`runSave`/`fire`) from an effect instead of during
  // render.
  useEffect(() => {
    latestValue.current = value;
  });

  useEffect(
    () => () => {
      mounted.current = false;
      clearTimeout(timer.current);
    },
    [],
  );

  if (value !== renderedValue || isReady !== renderedReady) {
    setRenderedValue(value);
    setRenderedReady(isReady);
    if (firstRender) {
      setFirstRender(false);
    } else if (isReady) {
      setStatus("saving");
    }
  }

  // A loop, not recursion: each pass sends whatever is CURRENT in
  // `latestValue` at the moment the previous request settles, so a change
  // that lands mid-flight is picked up with no extra debounce wait.
  const runSave = useCallback(async (initial: T) => {
    inFlight.current = true;
    let next: T | undefined = initial;
    while (next !== undefined) {
      const val = next;
      next = undefined;
      let failed = false;
      try {
        await onSaveRef.current(val);
      } catch {
        failed = true;
      }
      if (!mounted.current) return;
      if (pending.current) {
        pending.current = false;
        next = latestValue.current;
      } else if (failed) {
        inFlight.current = false;
        setStatus("error");
      } else {
        inFlight.current = false;
        setStatus("saved");
      }
    }
  }, []);

  const fire = useCallback(() => {
    if (inFlight.current) {
      pending.current = true;
      return;
    }
    void runSave(latestValue.current);
  }, [runSave]);

  useEffect(() => {
    if (firstEffect.current) {
      firstEffect.current = false;
      return;
    }
    clearTimeout(timer.current);
    if (!isReady) return;
    timer.current = setTimeout(fire, delayMs);
    return () => clearTimeout(timer.current);
  }, [value, isReady, delayMs, fire]);

  const retry = useCallback(() => {
    clearTimeout(timer.current);
    fire();
  }, [fire]);

  return { status, missingRequired: !isReady, retry };
}
