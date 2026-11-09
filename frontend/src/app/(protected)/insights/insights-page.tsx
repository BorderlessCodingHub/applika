"use client";

import { useTranslations } from "next-intl";
import { PhoneAvatar } from "@/components/phone/phone-avatar";
import { PhoneHeading } from "@/components/phone/phone-heading";
import { useAuth } from "@/contexts/auth-context";
import { useIsPhone, useLeaveAtDesktop } from "@/hooks/use-is-phone";
import { initials } from "@/lib/phone-format";

/**
 * `/insights`, the fourth tab, exists on phones only: at md and up the
 * dashboard holds the same charts, so the address goes there (PRD 0021 Q9).
 * Below md it shows the board's header (Insights.dc.html) until the Insights
 * board's content lands.
 */
export function InsightsPage() {
  const isPhone = useIsPhone();
  const { user } = useAuth();
  const t = useTranslations("phone.shell");
  useLeaveAtDesktop("/dashboard");

  if (!isPhone) return null;

  return (
    <div
      data-slot="phone-insights"
      className="ph-app flex flex-col gap-4 px-5 pt-5 pb-[calc(110px+env(safe-area-inset-bottom,0px))]"
    >
      <PhoneHeading
        title={t("insights")}
        trailing={user ? <PhoneAvatar initials={initials(user)} /> : null}
      />
    </div>
  );
}
