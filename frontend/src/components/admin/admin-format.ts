import { useLocale, useTranslations } from "next-intl";

import { formatNumber } from "@/i18n/format-number";

/**
 * Words and numbers the admin dashboard and users screen share, in the active
 * language. Each hook subscribes (`useTranslations` / `useLocale`), so a
 * language switch re-renders the caller.
 */

/** "today", "yesterday", "3d ago", "2mo ago" (pt: "hoje", "ontem", "há 3 dias", "há 2 meses"). */
export function useAdminRelative(): (iso: string) => string {
  const t = useTranslations("admin.time");
  return (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return t("today");
    if (days === 1) return t("yesterday");
    if (days < 30) return t("daysAgo", { days });
    return t("monthsAgo", { months: Math.floor(days / 30) });
  };
}

/**
 * A seniority value as the API sends it (`mid_level`, or the dashboard's
 * `mid level`, or `unknown`) in words. An unknown value shows as sent.
 */
export function useSeniorityLabel(): (level: string) => string {
  const t = useTranslations("options.seniority");
  const tAdmin = useTranslations("admin.dashboard.seniority");
  return (level) => {
    const key = level.replace(/ /g, "_");
    if (key === "unknown") return tAdmin("unknown");
    return t.has(key as never) ? t(key as never) : level.replace("_", " ");
  };
}

/** `open_to_work` in words; an unknown value shows as sent. */
export function useAvailabilityLabel(): (value: string) => string {
  const t = useTranslations("options.availability");
  return (value) =>
    t.has(value as never) ? t(value as never) : value.replace("_", " ");
}

/** A count the way the active language writes it (en: plain digits, as before). */
export function useAdminNumber(): (value: number, digits?: number) => string {
  const locale = useLocale();
  return (value, digits) => formatNumber(value, locale, digits);
}

/** The pager line, "Page 2 of 5". */
export function useAdminPager() {
  const t = useTranslations("admin.pager");
  const n = useAdminNumber();
  return {
    page: (page: number, total: number) =>
      t("page", { page: n(page), total: n(total) }),
    previous: t("previous"),
    next: t("next"),
  };
}
