"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ADMIN_TABS } from "@/components/admin/admin-nav";
import { normalizePath } from "@/components/layout/phone-nav";
import { PhoneTopBarEnd } from "@/components/layout/phone-shell";
import { PhoneChipLink } from "@/components/phone/phone-chip";
import { PhonePill } from "@/components/phone/phone-pill";

/** The admin sections drawn from a board (v2/Admin, v3); the others keep today's content. */
export const ADMIN_BOARD_PATHS: ReadonlySet<string> = new Set([
  "/admin",
  "/admin/users",
  "/admin/companies",
  "/admin/platforms",
  "/admin/jobs",
  "/admin/report-webhooks",
]);

/**
 * The v3 sections that head their own board: today's page title and
 * subtitle (message keys) as the h1 and its lead, above the chips.
 */
export const SECTION_HEADS: Readonly<
  Record<string, { title: string; lead: string }>
> = {
  "/admin/users": {
    title: "admin.users.title",
    lead: "admin.users.subtitle",
  },
  "/admin/companies": {
    title: "admin.catalog.company.title",
    lead: "admin.catalog.company.subtitle",
  },
  "/admin/platforms": {
    title: "admin.catalog.platform.title",
    lead: "admin.catalog.platform.subtitle",
  },
};

export function isAdminBoardPath(pathname: string): boolean {
  return ADMIN_BOARD_PATHS.has(normalizePath(pathname));
}

/** The chip on screen: `/admin` exactly, any other section by prefix (as `AdminNav`). */
function isCurrent(href: string, exact: boolean | undefined, path: string) {
  return exact ? path === href : path === href || path.startsWith(`${href}/`);
}

/**
 * v2/Admin's header below md, over every `/admin/*` page as `AdminNav` is at
 * md and up: "Admin Console", its lead, the seven sections as chips (links,
 * the current one `aria-current="page"`), and the bar's "System" pill.
 * A v3 section (`SECTION_HEADS`) puts its own title (26px) and lead there.
 * The title is the page's h1 on a board only; over a section that keeps
 * today's content (and today's own h1) it looks the same but is not a
 * heading, so every page has one h1.
 */
export function AdminPhoneHeader({ activePath }: { activePath: string }) {
  const t = useTranslations();
  const tNav = useTranslations("admin.nav");
  const tShell = useTranslations("nav");
  const chips = useRef<HTMLElement>(null);
  const path = normalizePath(activePath);
  const Title = isAdminBoardPath(path) ? "h1" : "p";
  const head = SECTION_HEADS[path];

  // "Report webhooks" sits past the right edge at 390px: bring the current chip into the row.
  useEffect(() => {
    const row = chips.current;
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !chip) return;
    const end = chip.offsetLeft + chip.offsetWidth;
    if (end > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = end - row.clientWidth + 20;
    }
  }, [path]);

  return (
    <>
      <PhoneTopBarEnd>
        <PhonePill>{tShell("system")}</PhonePill>
      </PhoneTopBarEnd>
      <div data-slot="admin-phone-header" className="ph-app ph-ad-top">
        <div className="ph-ad-head">
          <Title
            data-slot="admin-phone-title"
            className={head ? "ph-h1 ph-h1-26" : "ph-h1"}
          >
            {t(head?.title ?? "admin.dashboard.title")}
          </Title>
          <p className="ph-lead">
            {t(head?.lead ?? "admin.dashboard.subtitle")}
          </p>
        </div>
        <nav
          ref={chips}
          aria-label={tNav("label")}
          data-slot="admin-phone-chips"
          className="ph-hs ph-ad-chips"
        >
          {ADMIN_TABS.map((tab) => (
            <PhoneChipLink
              key={tab.href}
              href={tab.href}
              current={isCurrent(tab.href, tab.exact, path)}
            >
              {tNav(tab.label)}
            </PhoneChipLink>
          ))}
        </nav>
      </div>
    </>
  );
}

/**
 * Today's content of a section with no board (Features, a feature,
 * Supports, Discord webhooks) under the header: the header's 20px sides, no
 * `.ph-app` around it.
 */
export function AdminPhoneContent({ children }: { children: ReactNode }) {
  return (
    <div data-slot="admin-phone-content" className="ph-ad-other">
      {children}
    </div>
  );
}
