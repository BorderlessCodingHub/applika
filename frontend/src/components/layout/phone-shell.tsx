"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
import { FeedbackDialog } from "@/components/applications/feedback-dialog";
import { CliPromoBanner } from "@/components/cli-promo-banner";
import { PRIMARY_NAV, type NavItem } from "@/components/layout/nav";
import {
  TAB_ROOTS,
  hasFab,
  hasInterimHeading,
  isPhoneScreen,
  isTabRoot,
  normalizePath,
  phoneBackFor,
} from "@/components/layout/phone-nav";
import { PhoneAvatar } from "@/components/phone/phone-avatar";
import { PhoneFab } from "@/components/phone/phone-fab";
import { PhoneHeading } from "@/components/phone/phone-heading";
import { PhoneTabBar } from "@/components/phone/phone-tab-bar";
import { PhoneTopBar } from "@/components/phone/phone-top-bar";
import { initials } from "@/lib/phone-format";
import { cn } from "@/lib/utils";
import type { User } from "@/services/types/users";

interface PhoneShellValue {
  /** The entries the acting user sees (`navItemsFor`): the Account hub's rows come from them. */
  navItems: readonly NavItem[];
  /** Opens the shell's one FeedbackDialog. */
  openFeedback: () => void;
}

const PhoneShellContext = createContext<PhoneShellValue | null>(null);

/** The phone shell's services for a screen inside it (the Account hub). */
export function usePhoneShell(): PhoneShellValue {
  const context = useContext(PhoneShellContext);
  if (!context) {
    throw new Error("usePhoneShell must be used within <PhoneShell>");
  }
  return context;
}

export interface PhoneShellProps {
  children: ReactNode;
  /** Current pathname, from `usePathname()` in the consuming layout. */
  activePath: string;
  /** Nav entries, already filtered for the acting user (see `navItemsFor`). */
  navItems?: NavItem[];
  user: User | null;
  className?: string;
}

/**
 * The fixed chrome over the bottom of <main>: tab bar + FAB, the tab bar
 * alone, nothing. `pad` keeps today's content clear of it (a ported screen
 * reserves its own); `scroll` keeps a focused control clear of it when the
 * browser scrolls one into view (WCAG 2.4.11), on every screen with the chrome.
 */
const RESERVE = {
  tabAndFab: {
    pad: "pb-[calc(170px+env(safe-area-inset-bottom,0px))]",
    scroll: "scroll-pb-[calc(170px+env(safe-area-inset-bottom,0px))]",
  },
  tab: {
    pad: "pb-[calc(110px+env(safe-area-inset-bottom,0px))]",
    scroll: "scroll-pb-[calc(110px+env(safe-area-inset-bottom,0px))]",
  },
  none: { pad: "pb-10", scroll: undefined },
} as const;

/**
 * The signed-in shell below md (ADR-0027): no rail, no navigation sheet, no
 * header. Today, Pipeline, Agenda and Insights carry the bottom tab bar;
 * every other screen a back bar named after the screen it returns to; the
 * avatar opens the Account hub, which holds the rest. One <main> scrolls.
 *
 * Its root is `relative` with no z-index, transform or isolation, exactly as
 * `AppShell`'s: the tab bar, the FAB and `.ph-bar` sit at z-40 and the Radix
 * portal layer (z-50) above them; `CookieConsent` (z-40, later in the DOM)
 * covers the tab bar until it is acknowledged.
 */
export function PhoneShell({
  children,
  activePath,
  navItems = PRIMARY_NAV,
  user,
  className,
}: PhoneShellProps) {
  const t = useTranslations("phone.shell");
  const tNav = useTranslations("nav");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // The FAB's quick add. Today's create sheet fills the slot until the
  // QuickAdd board lands; it lives here, so crossing md unmounts a half-filled one.
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Mounted on the first press only: the closed sheet would already fetch
  // the platforms on a screen that never asked for them.
  const [quickAddUsed, setQuickAddUsed] = useState(false);

  const path = normalizePath(activePath);
  const backBar = phoneBackFor(path);
  const tabRoot = isTabRoot(path);
  const fab = hasFab(path);
  const ported = isPhoneScreen(path);
  const avatar = user ? <PhoneAvatar initials={initials(user)} /> : null;
  const reserve = fab
    ? RESERVE.tabAndFab
    : tabRoot
      ? RESERVE.tab
      : RESERVE.none;

  const openFeedback = useCallback(() => setFeedbackOpen(true), []);
  const shell = useMemo(
    () => ({ navItems, openFeedback }),
    [navItems, openFeedback],
  );

  return (
    <PhoneShellContext.Provider value={shell}>
      {/*
        `relative`, as `AppShell`'s root: it makes the shell the containing
        block its `overflow-hidden` really clips (Radix Select's hidden native
        `<select>`), and with `z-index: auto` it opens no stacking context.
      */}
      <div
        data-slot="phone-shell"
        className="relative flex h-viewport w-full flex-col overflow-hidden bg-background text-foreground"
      >
        {backBar ? (
          <PhoneTopBar href={backBar.href} label={backBar.label} />
        ) : null}

        {/* `.ph-scroll`: the boards' main scrolls with no visible scrollbar. */}
        <main
          className={cn(
            "ph-scroll min-h-0 flex-1 overflow-y-auto",
            reserve.scroll,
            className,
          )}
        >
          <div
            data-slot="app-content"
            className={cn(!ported && ["px-4 pt-6", reserve.pad])}
          >
            {/* A ported screen owns its board's padding; the banner keeps the board's margins. */}
            {ported ? (
              <div className="px-5 pt-5 empty:hidden">
                <CliPromoBanner />
              </div>
            ) : (
              <CliPromoBanner />
            )}
            {hasInterimHeading(path) && avatar ? (
              // Until the screen's board header lands: only the avatar, where the
              // board puts it (20px from the top and the right of the screen).
              <PhoneHeading trailing={avatar} className="-mt-1 pr-1" />
            ) : null}
            {children}
          </div>
        </main>

        {/* The FAB before the tab bar, as the boards order them (focus follows). */}
        {fab ? (
          <>
            <PhoneFab
              label={t("add")}
              aria-haspopup="dialog"
              onClick={() => {
                setQuickAddUsed(true);
                setQuickAddOpen(true);
              }}
            />
            {quickAddUsed ? (
              <ApplicationFormSheet
                open={quickAddOpen}
                onOpenChange={setQuickAddOpen}
                application={null}
              />
            ) : null}
          </>
        ) : null}

        {tabRoot ? (
          <PhoneTabBar
            label={tNav("primary")}
            tabs={TAB_ROOTS.map((root) => ({
              href: root.href,
              label: root.label,
              icon: root.icon,
              current: root.href === path,
            }))}
          />
        ) : null}

        <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      </div>
    </PhoneShellContext.Provider>
  );
}
