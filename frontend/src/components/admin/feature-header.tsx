"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, CircleAlert, SearchX, type LucideIcon } from "lucide-react";

import {
  FEATURE_COPY,
  FEATURE_LIST_COPY,
  featureNotFoundBody,
  type FeatureRow,
  useFeatureCopyLocale,
} from "@/components/admin/feature-copy";
import { FeatureStageBadge } from "@/components/admin/feature-stage-badge";
import {
  FeatureDescription,
  FeatureKey,
  FeatureReleased,
  RetryButton,
} from "@/components/admin/feature-table";
import { LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const H1 =
  "font-display text-xl font-bold tracking-tight-display text-foreground";

/** `/admin/features`: the h1 and what a stage means. */
export function FeatureListHeader({ className }: { className?: string }) {
  useFeatureCopyLocale();
  return (
    <div data-slot="features-header" className={className}>
      <h1 className={H1}>{FEATURE_LIST_COPY.title}</h1>
      <p className="mt-0.5 max-w-prose text-sm text-pretty text-muted-foreground">
        {FEATURE_LIST_COPY.description}
      </p>
    </div>
  );
}

export interface FeatureHeaderProps {
  /** The row from `GET /admin/features` whose `key` is the page's `?key=`. */
  feature: FeatureRow | undefined;
  isLoading?: boolean;
  isError?: boolean;
  /** Renders "Try again" on the error state when given. */
  onRetry?: () => void;
  isRetrying?: boolean;
  /** Right of the title from `sm`, under it below: the stage action. */
  action?: ReactNode;
  className?: string;
}

/** `/admin/features/view?key=`: name (h1), stage, description, key and release date. */
export function FeatureHeader({
  feature,
  isLoading = false,
  isError = false,
  onRetry,
  isRetrying = false,
  action,
  className,
}: FeatureHeaderProps) {
  useFeatureCopyLocale();
  const rootRef = useRef<HTMLElement>(null);
  const retried = useRef(false);
  const state =
    isLoading || (!feature && !isError)
      ? "loading"
      : feature
        ? "ready"
        : "error";

  // A Retry that unmounts on success would drop keyboard focus to <body>.
  useEffect(() => {
    if (state !== "ready" || !retried.current) return;
    retried.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    rootRef.current?.focus({ preventScroll: true });
  }, [state]);

  return (
    <header
      ref={rootRef}
      tabIndex={-1}
      data-slot="feature-header"
      data-state={state}
      className={cn("outline-none", className)}
    >
      {state === "loading" ? (
        <div role="status" className="flex flex-col gap-2.5">
          <span className="sr-only">{FEATURE_COPY.loading}</span>
          <div aria-hidden className="flex items-center gap-3">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
          <Skeleton aria-hidden className="h-4 w-full max-w-md" />
          <div aria-hidden className="flex gap-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      ) : state === "error" || !feature ? (
        <HeaderNotice
          role="alert"
          icon={CircleAlert}
          title={FEATURE_COPY.loadErrorTitle}
          body={FEATURE_COPY.loadErrorBody}
          action={
            onRetry ? (
              <RetryButton
                label={FEATURE_COPY.retry}
                isRetrying={isRetrying}
                onRetry={() => {
                  retried.current = true;
                  onRetry();
                }}
              />
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0">
            {/* The chip is a sibling of the h1, never inside it: heading names stay exact. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h1 className={cn(H1, "min-w-0 break-words")}>{feature.name}</h1>
              <FeatureStageBadge stage={feature.stage} />
            </div>
            <FeatureDescription
              value={feature.description}
              className="mt-1 max-w-prose text-sm"
            />
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="flex items-baseline gap-2">
                <dt className="text-muted-foreground">{FEATURE_COPY.key}</dt>
                <dd>
                  <FeatureKey value={feature.key} />
                </dd>
              </div>
              <div className="flex items-baseline gap-2">
                <dt className="text-muted-foreground">
                  {FEATURE_COPY.released}
                </dt>
                <dd>
                  <FeatureReleased
                    stage={feature.stage}
                    releasedAt={feature.released_at}
                  />
                </dd>
              </div>
            </dl>
          </div>
          {action ? <div className="shrink-0 self-start">{action}</div> : null}
        </div>
      )}
    </header>
  );
}

export interface FeatureNotFoundProps {
  /** The `?key=` asked for; absent or blank reads as "no key". */
  featureKey?: string | null;
  /** The 404 in words (by its code, `api-error-message.ts`), e.g. "Feature not found". */
  message?: string | null;
  className?: string;
}

/** An unknown `?key=`: the 404 words as the h1 and the way back to the list. */
export function FeatureNotFound({
  featureKey,
  message,
  className,
}: FeatureNotFoundProps) {
  useFeatureCopyLocale();
  return (
    <HeaderNotice
      data-slot="feature-not-found"
      icon={SearchX}
      title={message?.trim() || FEATURE_COPY.notFoundTitle}
      body={featureNotFoundBody(featureKey?.trim())}
      action={
        <LinkButton href="/admin/features" variant="outline" size="sm">
          <ArrowLeft aria-hidden data-icon="inline-start" />
          {FEATURE_COPY.backToFeatures}
        </LinkButton>
      }
      className={className}
    />
  );
}

function HeaderNotice({
  icon: Icon,
  title,
  body,
  action,
  role,
  className,
  "data-slot": dataSlot,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  role?: "alert";
  className?: string;
  "data-slot"?: string;
}) {
  return (
    <div
      role={role}
      data-slot={dataSlot}
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-card px-5 py-6 sm:flex-row sm:items-center sm:gap-4",
        className,
      )}
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-lg font-semibold text-foreground">
          {title}
        </h1>
        <p className="mt-0.5 text-sm text-pretty text-foreground/70">{body}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
