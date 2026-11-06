"use client";

import type * as React from "react";
import { BadgeCheck } from "lucide-react";
import { useLocale } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { word } from "@/i18n/translator";
import { cn } from "@/lib/utils";
import type { MembershipBadgeKey } from "@/services/types/users";

export type { MembershipBadgeKey };

/** Display order wherever more than one badge is listed. */
export const MEMBERSHIP_BADGE_KEYS = [
  "borderless_base",
  "borderless_psp",
] as const satisfies readonly MembershipBadgeKey[];

export const MEMBERSHIP_BADGE_LABEL: Record<MembershipBadgeKey, string> = {
  borderless_base: "BASE",
  borderless_psp: "PSP",
};

export function isMembershipBadgeKey(
  value: unknown,
): value is MembershipBadgeKey {
  return (
    typeof value === "string" &&
    (MEMBERSHIP_BADGE_KEYS as readonly string[]).includes(value)
  );
}

/**
 * "Borderless PSP member": the chip's accessible name, in the active language
 * ("BASE"/"PSP" are brand names and never change).
 */
export function membershipBadgeName(badge: MembershipBadgeKey): string {
  return word("badges.memberName", { badge: MEMBERSHIP_BADGE_LABEL[badge] });
}

export type MembershipAccessState = "held" | "unconfirmed" | "none";

export interface MembershipAccessInput {
  badges?: readonly { badge: string }[] | null;
  borderless?: { status: string } | null;
}

export interface MembershipAccess {
  state: MembershipAccessState;
  /** Recorded badges, deduped, BASE before PSP. */
  badges: MembershipBadgeKey[];
}

/**
 * One rule for the chip, the menu prompt, the Reports entry and the gate:
 * no recorded badge is `none`; a recorded badge counts (`held`) only while
 * the Borderless access is `active`, otherwise it is `unconfirmed`.
 */
export function membershipAccess(
  user: MembershipAccessInput | null | undefined,
): MembershipAccess {
  const recorded = new Set(
    (user?.badges ?? []).map((row) => row.badge).filter(isMembershipBadgeKey),
  );
  const badges = MEMBERSHIP_BADGE_KEYS.filter((key) => recorded.has(key));
  if (badges.length === 0) return { state: "none", badges };
  const active = user?.borderless?.status === "active";
  return { state: active ? "held" : "unconfirmed", badges };
}

// `sm` drops the seal: it sits after a truncated 12px name in the w-60 rail.
const SIZE_CLASS = {
  sm: "h-4.5 px-1.5 text-[11px]",
  default: "h-5 px-1.5 text-xs",
  lg: "h-6 gap-1.5 px-2 text-xs [&>svg]:size-3.5",
} as const;

export type MembershipBadgeSize = keyof typeof SIZE_CLASS;

export interface MembershipBadgeProps extends Omit<
  React.ComponentProps<"span">,
  "children" | "role"
> {
  badge: MembershipBadgeKey;
  /** `sm`: sidebar account trigger; `default`: account menu label; `lg`: profile header. */
  size?: MembershipBadgeSize;
  /**
   * `member`: the signed-in user's own badge, one image named
   * "Borderless PSP member". `label`: a badge assigned to something else
   * (a report webhook), plain text read in its row's context.
   */
  purpose?: "member" | "label";
}

/** "BASE" or "PSP" in words; the teal tint and seal only repeat it. */
export function MembershipBadge({
  badge,
  size = "default",
  purpose = "member",
  className,
  ...props
}: MembershipBadgeProps) {
  // Subscribes: `membershipBadgeName` reads the active language at call time.
  useLocale();
  const member = purpose === "member";

  return (
    <Badge
      variant="outline"
      data-slot="membership-badge"
      data-badge={badge}
      role={member ? "img" : undefined}
      aria-label={member ? membershipBadgeName(badge) : undefined}
      className={cn(
        "rounded-sm border-primary/50 bg-primary-muted font-display leading-none font-semibold tracking-wide-label text-foreground",
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {size === "sm" ? null : (
        <BadgeCheck aria-hidden className="text-primary" />
      )}
      {MEMBERSHIP_BADGE_LABEL[badge]}
    </Badge>
  );
}
