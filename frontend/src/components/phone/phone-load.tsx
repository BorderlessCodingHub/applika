"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * A phone section's data: one shape for every ported screen. `message` is
 * `getApiError`'s words; `retrying` while the refetch runs (the card stays).
 */
export type PhoneLoad<T> =
  | { status: "loading" }
  | {
      status: "error";
      message: string;
      onRetry: () => void;
      retrying?: boolean;
    }
  | { status: "ready"; data: T };

export interface PhoneLoadableProps<T> {
  state: PhoneLoad<T>;
  /** The board's shapes while loading: `PhoneSkeleton` around `PhoneSkeletonCard`s. */
  loading: ReactNode;
  children: (data: T) => ReactNode;
  className?: string;
  /** On the error card: inside a board card, drop its own card look. */
  errorClassName?: string;
  /** The failure as the board draws it (v3/AdminFeatures' card); absent, `PhoneLoadError`. Its retry calls the `onRetry` given here. */
  error?: (failure: PhoneLoadFailure) => ReactNode;
}

/** A failed section, as `PhoneLoadable` hands it to a board's own error card. */
export interface PhoneLoadFailure {
  message: string;
  onRetry: () => void;
  retrying: boolean;
}

/**
 * Renders a section's loading shapes, its error card or its content. A
 * successful Retry unmounts the button it was pressed on: the region takes
 * focus back, only when focus was lost.
 */
export function PhoneLoadable<T>({
  state,
  loading,
  children,
  className,
  errorClassName,
  error,
}: PhoneLoadableProps<T>) {
  const region = useRef<HTMLDivElement>(null);
  const retried = useRef(false);
  const status = state.status;

  useLayoutEffect(() => {
    if (status === "error" || !retried.current) return;
    retried.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) {
      region.current?.focus({ preventScroll: true });
    }
  }, [status]);

  return (
    <div
      ref={region}
      tabIndex={-1}
      data-slot="phone-loadable"
      data-status={status}
      className={className}
    >
      {state.status === "loading" ? (
        loading
      ) : state.status === "error" ? (
        error ? (
          <BoardFailure
            render={error}
            message={state.message}
            retrying={state.retrying ?? false}
            onRetry={() => {
              retried.current = true;
              state.onRetry();
            }}
          />
        ) : (
          <PhoneLoadError
            message={state.message}
            retrying={state.retrying}
            className={errorClassName}
            onRetry={() => {
              retried.current = true;
              state.onRetry();
            }}
          />
        )
      ) : (
        children(state.data)
      )}
    </div>
  );
}

function BoardFailure({
  render,
  ...failure
}: PhoneLoadFailure & { render: (failure: PhoneLoadFailure) => ReactNode }) {
  return <>{render(failure)}</>;
}

export interface PhoneSkeletonProps {
  /** Read while the shapes show, e.g. "Loading applications". */
  label: string;
  className?: string;
  children: ReactNode;
}

/** A polite busy region: the label for assistive tech, the shapes hidden from it. */
export function PhoneSkeleton({
  label,
  className,
  children,
}: PhoneSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      data-slot="phone-skeleton"
      className={cn("relative", className)}
    >
      <span className="ph-sr">{label}</span>
      <div aria-hidden="true" className="flex flex-col gap-2.5">
        {children}
      </div>
    </div>
  );
}

/** One placeholder in the board's card shape (surface, `shadow-card`, r20 unless given). */
export function PhoneSkeletonCard({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn(
        "rounded-[20px] bg-surface shadow-card motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export interface PhoneLoadErrorProps {
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
}

/** The section's failure in a board card: what went wrong, and Retry. */
export function PhoneLoadError({
  message,
  onRetry,
  retrying = false,
  className,
}: PhoneLoadErrorProps) {
  const t = useTranslations("phone.load");
  return (
    <div
      data-slot="phone-load-error"
      className={cn(
        "ph-card flex flex-col items-start gap-3 p-[18px]",
        className,
      )}
    >
      <p className="m-0 text-[14px] text-foreground">{message}</p>
      {/* aria-disabled, never disabled: a disabled button drops focus to <body>. */}
      <button
        type="button"
        aria-disabled={retrying || undefined}
        aria-busy={retrying || undefined}
        onClick={() => {
          if (!retrying) onRetry();
        }}
        className="ph-btn ph-sm ph-sec"
      >
        {retrying ? (
          <Loader2 size={16} aria-hidden="true" className="ph-spin" />
        ) : null}
        {t("retry")}
      </button>
    </div>
  );
}
