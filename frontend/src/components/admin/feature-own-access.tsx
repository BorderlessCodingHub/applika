"use client";

import { useId } from "react";
import {
  EyeOff,
  Info,
  ListChecks,
  LoaderCircle,
  Minus,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  FEATURE_OWN_ACCESS_COPY,
  featureAccessKind,
  featureAccessReason,
  featureOwnAccessLock,
  type FeatureAccess,
  type FeatureAccessKind,
} from "@/components/admin/feature-copy";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { FeatureStage } from "@/services/types/features";

export interface FeatureOwnAccessProps {
  stage: FeatureStage | undefined;
  /** The row's `me`; `undefined` renders the loading state. */
  me: FeatureAccess | undefined;
  /** `true` → `DELETE …/opt-out`, `false` → `PUT …/opt-out`. Never called while locked or pending. */
  onUseChange: (use: boolean) => void;
  /** The PUT/DELETE is in flight: `aria-disabled` + `aria-busy`, focus stays on the switch. */
  pending?: boolean;
  /** While `pending`, the value asked for; without it the switch shows `me` until the refetch lands. */
  pendingValue?: boolean;
  className?: string;
}

const KIND_TILE: Record<FeatureAccessKind, { icon: LucideIcon; tone: string }> =
  {
    general: { icon: Users, tone: "bg-success/10 text-success" },
    list: { icon: ListChecks, tone: "bg-primary/10 text-primary" },
    admin: { icon: ShieldCheck, tone: "bg-warning/10 text-warning" },
    off: { icon: EyeOff, tone: "bg-muted text-muted-foreground" },
    none: { icon: Minus, tone: "bg-muted text-muted-foreground" },
  };

/**
 * AC8-AC11 / R-016, R-017: the admin's own access, why, and "Use this feature
 * myself" (on = no opt-out). The switch shows the STORED choice in every
 * stage; it is locked in general and while the admin is on the beta list.
 */
export function FeatureOwnAccess({
  stage,
  me,
  onUseChange,
  pending = false,
  pendingValue,
  className,
}: FeatureOwnAccessProps) {
  const headingId = useId();
  const switchId = useId();
  const hintId = useId();

  if (!me || !stage) {
    return (
      <section
        aria-labelledby={headingId}
        data-slot="feature-own-access"
        data-state="loading"
        className={cn("rounded-xl border bg-card shadow-sm", className)}
      >
        <h2
          id={headingId}
          className="border-b px-5 py-3 text-sm font-semibold text-foreground"
        >
          {FEATURE_OWN_ACCESS_COPY.title}
        </h2>
        <div role="status" className="flex flex-col gap-4 px-5 py-4">
          <span className="sr-only">{FEATURE_OWN_ACCESS_COPY.loading}</span>
          <div aria-hidden className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="h-5 w-72 max-w-full" />
          </div>
          <div aria-hidden className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-[1.15rem] w-8 rounded-full" />
          </div>
        </div>
      </section>
    );
  }

  const kind = featureAccessKind(me);
  const lock = featureOwnAccessLock(stage, me);
  const { icon: Icon, tone } = KIND_TILE[kind];
  const stored = !me.opted_out;
  const checked = pending && pendingValue !== undefined ? pendingValue : stored;
  const unavailable = pending || lock !== null;
  const hint =
    lock === "general"
      ? FEATURE_OWN_ACCESS_COPY.lockedGeneral
      : lock === "list"
        ? FEATURE_OWN_ACCESS_COPY.lockedList
        : FEATURE_OWN_ACCESS_COPY.hint;

  return (
    <section
      aria-labelledby={headingId}
      data-slot="feature-own-access"
      data-state="ready"
      data-access={kind}
      data-lock={lock ?? undefined}
      className={cn("rounded-xl border bg-card shadow-sm", className)}
    >
      <h2
        id={headingId}
        className="border-b px-5 py-3 text-sm font-semibold text-foreground"
      >
        {FEATURE_OWN_ACCESS_COPY.title}
      </h2>

      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-md",
              tone,
            )}
          >
            <Icon className="size-4.5" />
          </span>
          {/* Live: focus stays on the switch, so the new reason is announced, not seen. */}
          <p
            aria-live="polite"
            aria-atomic="true"
            data-slot="feature-own-access-reason"
            className="min-w-0 text-base font-medium text-pretty text-foreground"
          >
            {featureAccessReason(me)}
          </p>
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label
              htmlFor={switchId}
              className={cn(
                "text-sm",
                lock ? "cursor-default" : "cursor-pointer",
              )}
            >
              {FEATURE_OWN_ACCESS_COPY.switchLabel}
            </Label>
            <p
              id={hintId}
              data-slot="feature-own-access-hint"
              data-lock={lock ?? undefined}
              className="mt-1.5 flex items-start gap-1.5 text-sm text-pretty text-muted-foreground"
            >
              {lock ? (
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              ) : null}
              <span>{hint}</span>
            </p>
          </div>
          <span className="flex h-5 shrink-0 items-center gap-2">
            {pending ? (
              <LoaderCircle
                aria-hidden
                className="size-3.5 text-muted-foreground motion-safe:animate-spin"
              />
            ) : null}
            {/* aria-disabled, not disabled: a locked switch stays focusable so its reason is read with it, and pending keeps focus (KODI-048). */}
            <Switch
              id={switchId}
              checked={checked}
              aria-describedby={hintId}
              aria-disabled={unavailable || undefined}
              aria-busy={pending || undefined}
              data-slot="feature-own-access-switch"
              data-lock={lock ?? undefined}
              onCheckedChange={(value) => {
                if (!unavailable) onUseChange(value);
              }}
              className={cn(
                "aria-disabled:opacity-60",
                pending
                  ? "aria-disabled:cursor-progress"
                  : "aria-disabled:cursor-not-allowed",
              )}
            />
          </span>
        </div>
      </div>
    </section>
  );
}
