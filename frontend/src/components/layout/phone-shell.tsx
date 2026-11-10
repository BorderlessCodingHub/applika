"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { FeedbackDialog } from "@/components/applications/feedback-dialog";
import { CliPromoBanner } from "@/components/cli-promo-banner";
import { PRIMARY_NAV, type NavItem } from "@/components/layout/nav";
import {
  TAB_ROOTS,
  hasFab,
  isPhoneScreen,
  isTabRoot,
  normalizePath,
  phoneBackFor,
} from "@/components/layout/phone-nav";
import { PhoneFab } from "@/components/phone/phone-fab";
import { PhoneTabBar } from "@/components/phone/phone-tab-bar";
import { PhoneTopBar } from "@/components/phone/phone-top-bar";
import { QuickAddSheet } from "@/components/phone/screens/quick-add-sheet";
import { useCycleContext } from "@/contexts/cycle-context";
import { useFixedChromeShift } from "@/lib/fixed-chrome-shift";
import { cn } from "@/lib/utils";
import type { User } from "@/services/types/users";

interface PhoneShellValue {
  /** The entries the acting user sees (`navItemsFor`): the Account hub's rows come from them. */
  navItems: readonly NavItem[];
  /** Opens the shell's one FeedbackDialog. */
  openFeedback: () => void;
  /** Opens the FAB's quick-add sheet (the Pipeline's "Create your first application"). */
  openQuickAdd: () => void;
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

/** `usePhoneShell()`, or `null` outside the shell (a screen rendered on its own in a test). */
export function useOptionalPhoneShell(): PhoneShellValue | null {
  return useContext(PhoneShellContext);
}

/** Withdraws one hold. Safe to call twice. */
type ReleaseChrome = () => void;

const HideChromeContext = createContext<(() => ReleaseChrome) | null>(null);

/**
 * Renders nothing; while mounted, the shell draws no tab bar and no FAB and
 * reserves no room for them (v2/Application draws neither: the screen owns
 * its sticky header and its fixed bar). Render it in the same branch as the
 * screen. A layout effect, so the chrome is gone before paint; a COUNT, as
 * `FullWidthContent`'s, so Strict Mode's remount never releases a hold
 * another still keeps. A no-op outside the shell.
 */
export function PhoneChromeless(): null {
  const hide = useContext(HideChromeContext);
  useLayoutEffect(() => hide?.(), [hide]);
  return null;
}

const BackHrefContext = createContext<((href: string) => ReleaseChrome) | null>(
  null,
);

/**
 * Renders nothing; while mounted, the shell's back bar goes to `href`
 * instead of the map's (`phoneBackFor`), keeping the map's label (a screen
 * that returns to one row of its parent, `/applications?focus=<id>`). A
 * layout effect, so the link is right before paint; a hold, as
 * `PhoneChromeless`: the last one mounted wins, and unmounting it gives the
 * map's address back. A no-op outside the shell and on a screen with no
 * back bar.
 */
export function PhoneBackHref({ href }: { href: string }): null {
  const hold = useContext(BackHrefContext);
  useLayoutEffect(() => hold?.(href), [hold, href]);
  return null;
}

/** The back bar's right-hand slot: `null` while no back bar is mounted (a tab root). */
const TopBarEndContext = createContext<{ element: HTMLElement | null } | null>(
  null,
);

/**
 * Puts its children at the right of the shell's back bar (a board's Edit,
 * System pill, status pill): the back link stays the shell's. Portalled, so
 * the DOM and tab order follow the bar, before <main>. Nothing on a screen
 * with no back bar; in place outside the shell (a screen tested alone).
 */
export function PhoneTopBarEnd({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarEndContext);
  if (!slot) return <>{children}</>;
  return slot.element ? createPortal(children, slot.element) : null;
}

export interface PhoneShellProps {
  children: ReactNode;
  /** Current pathname, from `usePathname()` in the consuming layout. */
  activePath: string;
  /** Nav entries, already filtered for the acting user (see `navItemsFor`). */
  navItems?: NavItem[];
  /** The signed-in user. Each board header draws the initials itself (`useAuth`), so the shell reads none. */
  user: User | null;
  className?: string;
}

/** Below md the applika-cli banner shows on Today only. */
const CLI_BANNER_PATH = "/dashboard";

/**
 * The fixed chrome over the bottom of the page: tab bar + FAB, the tab bar
 * alone, nothing. `pad` keeps today's content clear of it (a ported screen
 * reserves its own); `key` is the root's `data-reserve`, which `phone.css`
 * turns into the document's `scroll-padding-bottom`, so a focused control is
 * scrolled clear of it (WCAG 2.4.11), on every screen with the chrome.
 */
const RESERVE = {
  tabAndFab: {
    pad: "pb-[calc(170px+env(safe-area-inset-bottom,0px))]",
    key: "tab-and-fab",
  },
  tab: {
    pad: "pb-[calc(110px+env(safe-area-inset-bottom,0px))]",
    key: "tab",
  },
  none: { pad: "pb-10", key: undefined },
} as const;

/**
 * The signed-in shell below md (ADR-0027): no rail, no navigation sheet, no
 * header. Today, Pipeline, Agenda and Insights carry the bottom tab bar;
 * every other screen a back bar named after the screen it returns to; the
 * avatar opens the Account hub, which holds the rest. The document scrolls,
 * never <main>: a mobile browser collapses its toolbars only on a document
 * scroll (Edge and Safari on iOS keep them while a box scrolls), so the back
 * bar is sticky and the tab bar, the FAB and `.ph-bar` are fixed.
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
  className,
}: PhoneShellProps) {
  const t = useTranslations("phone.shell");
  const tNav = useTranslations("nav");
  const { isViewingPastCycle } = useCycleContext();
  // The document scrolls: keep the fixed bottom chrome on the visible bottom
  // edge where iOS Edge and Chrome hide their toolbar without moving it.
  useFixedChromeShift();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // The FAB's quick add (v2/QuickAdd). It lives here, so crossing md
  // unmounts a half-filled one (PRD 0021 edge case).
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // Mounted on the first press only: the closed sheet would already fetch
  // the platforms on a screen that never asked for them.
  const [quickAddUsed, setQuickAddUsed] = useState(false);
  // `PhoneChromeless` holds: the Application screen draws no tab bar or FAB.
  const [chromeHolds, setChromeHolds] = useState(0);
  // `PhoneBackHref` holds, in mount order: the last one is the back bar's address.
  const [backHrefs, setBackHrefs] = useState<
    readonly { hold: object; href: string }[]
  >([]);
  // The back bar's end slot, set by its ref (a layout-phase update: filled before paint).
  const [topBarEnd, setTopBarEnd] = useState<HTMLDivElement | null>(null);
  const topBarSlot = useMemo(() => ({ element: topBarEnd }), [topBarEnd]);

  const path = normalizePath(activePath);
  const chromeless = chromeHolds > 0;
  const backBar = phoneBackFor(path);
  const backHref = backHrefs.at(-1)?.href;
  const tabRoot = isTabRoot(path) && !chromeless;
  // An archived cycle's Pipeline is read-only: nothing to add to it (the
  // desktop hides "New application" the same way). Today keeps its FAB.
  const fab =
    hasFab(path) &&
    !chromeless &&
    !(path === "/applications" && isViewingPastCycle);
  const ported = isPhoneScreen(path);
  const reserve = fab
    ? RESERVE.tabAndFab
    : tabRoot
      ? RESERVE.tab
      : RESERVE.none;

  const openFeedback = useCallback(() => setFeedbackOpen(true), []);
  const openQuickAdd = useCallback(() => {
    setQuickAddUsed(true);
    setQuickAddOpen(true);
  }, []);
  const hideChrome = useCallback((): ReleaseChrome => {
    setChromeHolds((count) => count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setChromeHolds((count) => count - 1);
    };
  }, []);
  const holdBackHref = useCallback((href: string): ReleaseChrome => {
    const hold = {};
    setBackHrefs((list) => [...list, { hold, href }]);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setBackHrefs((list) => list.filter((entry) => entry.hold !== hold));
    };
  }, []);
  const shell = useMemo(
    () => ({ navItems, openFeedback, openQuickAdd }),
    [navItems, openFeedback, openQuickAdd],
  );

  return (
    <PhoneShellContext.Provider value={shell}>
      <HideChromeContext.Provider value={hideChrome}>
        <BackHrefContext.Provider value={holdBackHref}>
          <TopBarEndContext.Provider value={topBarSlot}>
            {/*
        `relative`, as `AppShell`'s root: it makes the shell the containing
        block its `overflow-clip` really clips (Radix Select's hidden native
        `<select>`), and with `z-index: auto` it opens no stacking context.
        `clip`, never `hidden`: it opens no scroll container, so the document
        scrolls and the sticky back bar sticks to the viewport.
      */}
            <div
              data-slot="phone-shell"
              data-reserve={reserve.key}
              data-back-bar={backBar ? "" : undefined}
              className="ph-shell relative flex min-h-viewport w-full flex-col overflow-clip bg-background text-foreground"
            >
              {backBar ? (
                <PhoneTopBar
                  href={backHref ?? backBar.href}
                  label={backBar.label}
                  endRef={setTopBarEnd}
                  className="sticky top-0 z-30"
                />
              ) : null}

              <main className={cn("flex-1", className)}>
                <div
                  data-slot="app-content"
                  className={cn(!ported && ["px-4 pt-6", reserve.pad])}
                >
                  {/* The applika-cli banner, on Today only (at md and up `AppShell` keeps it on every page). Today is a ported screen: the banner keeps the board's margins. */}
                  {path === CLI_BANNER_PATH ? (
                    <div className="px-5 pt-5 empty:hidden">
                      <CliPromoBanner />
                    </div>
                  ) : null}
                  {children}
                </div>
              </main>

              {/* The FAB before the tab bar, as the boards order them (focus follows). */}
              {fab ? (
                <PhoneFab
                  label={t("add")}
                  aria-haspopup="dialog"
                  onClick={openQuickAdd}
                />
              ) : null}
              {quickAddUsed ? (
                <QuickAddSheet
                  open={quickAddOpen}
                  onOpenChange={setQuickAddOpen}
                  activePath={path}
                />
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

              <FeedbackDialog
                open={feedbackOpen}
                onOpenChange={setFeedbackOpen}
              />
            </div>
          </TopBarEndContext.Provider>
        </BackHrefContext.Provider>
      </HideChromeContext.Provider>
    </PhoneShellContext.Provider>
  );
}
