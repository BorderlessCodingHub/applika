"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface PhoneAvatarProps {
  /** Already uppercased (`initials()` in `lib/phone-format.ts`). */
  initials: string;
  className?: string;
}

export function PhoneAvatar({ initials, className }: PhoneAvatarProps) {
  const t = useTranslations("phone.shell");
  return (
    <Link
      href="/account"
      aria-label={t("account")}
      data-slot="phone-avatar"
      className={cn("ph-avatar", className)}
    >
      <span>{initials}</span>
    </Link>
  );
}
