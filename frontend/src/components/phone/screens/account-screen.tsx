"use client";

import { useId } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  membershipAccess,
  membershipBadgeName,
} from "@/components/badges/membership-badge";
import { accountRows, type AccountHubRow } from "@/components/layout/phone-nav";
import { usePhoneShell } from "@/components/layout/phone-shell";
import { PhoneGroup, PhoneGroupRow } from "@/components/phone/phone-group";
import { PhonePill } from "@/components/phone/phone-pill";
import { PhoneSegmented } from "@/components/phone/phone-segmented";
import { useAuth } from "@/contexts/auth-context";
import { useCycleContext } from "@/contexts/cycle-context";
import { useCycles } from "@/hooks/use-cycles";
import { useHoldsReportsBadge, useReports } from "@/hooks/use-repports";
import { useSessions } from "@/hooks/use-sessions";
import type { Locale } from "@/i18n/config";
import { useLocaleSwitch } from "@/i18n/locale-provider";
import { displayName, initials } from "@/lib/phone-format";

export interface AccountRow {
  key: string;
  href: string;
  label: string;
  icon?: LucideIcon;
  meta?: string;
  metaMono?: boolean;
  beta?: boolean;
}

export type PhoneTheme = "light" | "dark";

export interface AccountScreenViewProps {
  displayName: string;
  /** Already uppercased. */
  initials: string;
  /** One "Borderless BASE member" per held badge, as the desktop menu; empty when none is held. */
  membershipLabels: readonly string[];
  workspaceRows: readonly AccountRow[];
  accountRows: readonly AccountRow[];
  language: Locale;
  onLanguageChange: (locale: Locale) => void;
  languagePending?: boolean;
  /** next-themes `resolvedTheme`; `undefined` before it resolves. */
  theme: PhoneTheme | undefined;
  onThemeChange: (theme: PhoneTheme) => void;
  showSignInAgain: boolean;
  onSignInAgain: () => void;
  onFeedback: () => void;
  onLogout: () => void;
}

const ROW_CARD = "ph-row ph-card px-4 py-0";

export function AccountScreenView({
  displayName,
  initials,
  membershipLabels,
  workspaceRows,
  accountRows,
  language,
  onLanguageChange,
  languagePending = false,
  theme,
  onThemeChange,
  showSignInAgain,
  onSignInAgain,
  onFeedback,
  onLogout,
}: AccountScreenViewProps) {
  const t = useTranslations("phone.account");
  const tShell = useTranslations("phone.shell");
  const tFeatures = useTranslations("features");
  const tMenu = useTranslations("userMenu");
  const workspaceId = useId();
  const accountId = useId();
  const languageId = useId();
  const themeId = useId();

  const row = (item: AccountRow) => (
    <PhoneGroupRow
      key={item.key}
      rowKey={item.key}
      href={item.href}
      label={item.label}
      icon={item.icon}
      meta={item.meta}
      metaMono={item.metaMono}
      trailing={
        item.beta ? (
          <span className="ph-beta">{tFeatures("beta")}</span>
        ) : undefined
      }
    />
  );

  return (
    <div
      data-slot="phone-account"
      className="ph-app flex flex-col gap-6 px-5 pt-1 pb-10"
    >
      <div className="flex flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex size-19 items-center justify-center rounded-full bg-primary-muted text-[26px] font-bold text-accent-foreground"
        >
          {initials}
        </span>
        <h1 className="mt-3.5 mb-0 max-w-full truncate text-[24px] font-bold tracking-[-0.02em]">
          {displayName}
        </h1>
        {membershipLabels.length > 0 ? (
          <p className="mt-1.5 mb-0 flex max-w-full flex-wrap justify-center gap-1">
            {membershipLabels.map((label) => (
              <PhonePill key={label} tone="pri">
                {label}
              </PhonePill>
            ))}
          </p>
        ) : null}
        <Link href="/profile" className="ph-hit mt-2.5 -mb-0.5">
          <span className="inline-flex h-10 items-center rounded-full bg-surface px-4 text-[14px] font-semibold text-foreground shadow-card">
            {t("viewProfile")}
          </span>
        </Link>
      </div>

      {workspaceRows.length > 0 ? (
        <section aria-labelledby={workspaceId}>
          <h2 id={workspaceId} className="ph-gh">
            {t("workspace")}
          </h2>
          <PhoneGroup>{workspaceRows.map(row)}</PhoneGroup>
        </section>
      ) : null}

      {accountRows.length > 0 ? (
        <section aria-labelledby={accountId}>
          <h2 id={accountId} className="ph-gh">
            {tShell("account")}
          </h2>
          <PhoneGroup>
            {accountRows.map((item) => row({ ...item, icon: undefined }))}
          </PhoneGroup>
        </section>
      ) : null}

      <section aria-labelledby={themeId}>
        <h2 id={themeId} className="ph-gh">
          {t("theme")}
        </h2>
        <PhoneSegmented<PhoneTheme>
          labelledBy={themeId}
          segments={[
            { value: "light", label: t("light") },
            { value: "dark", label: t("dark") },
          ]}
          value={theme}
          onValueChange={onThemeChange}
        />
      </section>

      <section aria-labelledby={languageId}>
        <h2 id={languageId} className="ph-gh">
          {t("language")}
        </h2>
        <PhoneSegmented<Locale>
          labelledBy={languageId}
          segments={[
            { value: "en", label: t("english"), lang: "en" },
            { value: "pt-BR", label: t("portuguese"), lang: "pt-BR" },
          ]}
          value={language}
          onValueChange={onLanguageChange}
          busy={languagePending}
        />
      </section>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          aria-haspopup="dialog"
          data-slot="account-feedback"
          onClick={onFeedback}
          className={ROW_CARD}
        >
          <span className="ph-grow">{t("sendFeedback")}</span>
          <ChevronRight
            size={18}
            aria-hidden="true"
            className="text-muted-foreground"
          />
        </button>
        {showSignInAgain ? (
          <button
            type="button"
            data-slot="account-sign-in-again"
            onClick={onSignInAgain}
            className={ROW_CARD}
          >
            <span className="ph-grow">{tMenu("signInAgain")}</span>
            <ChevronRight
              size={18}
              aria-hidden="true"
              className="text-muted-foreground"
            />
          </button>
        ) : null}
        <button
          type="button"
          data-slot="account-logout"
          onClick={onLogout}
          className="flex min-h-14 w-full cursor-pointer items-center justify-center rounded-[20px] bg-surface text-[15px] font-semibold text-(color:--destructive-text) shadow-card"
        >
          {tMenu("logout")}
        </button>
      </section>

      <p className="m-0 flex justify-center gap-4 text-[12px] text-muted-foreground">
        <Link href="/cookie-policy" className="ph-hit -my-[15px]">
          <span>{t("cookiePolicy")}</span>
        </Link>
        <span>{t("openSource")}</span>
      </p>
    </div>
  );
}

/**
 * The Account hub with its data (`/account`, below md): the rows come from
 * the `navItems` the shell holds, so each entry shows exactly when the rail
 * shows it; the metas read today's hooks and show nothing while loading or
 * failed. Send feedback opens the shell's one FeedbackDialog.
 */
export function AccountScreen() {
  const { user, logout } = useAuth();
  const { navItems, openFeedback } = usePhoneShell();
  const { locale, setLocale, isPending } = useLocaleSwitch();
  const { resolvedTheme, setTheme } = useTheme();
  const t = useTranslations("phone.account");
  const tNav = useTranslations("nav");
  const tCycle = useTranslations("cycleSelector");
  const sessions = useSessions();
  // Off without a held badge: no report request is sent (ADR-0026).
  const holdsBadge = useHoldsReportsBadge();
  const { currentDay } = useReports();
  const cycles = useCycles();
  const { selectedCycleId } = useCycleContext();

  if (!user) return null;

  const viewedCycle =
    selectedCycleId === null
      ? tCycle("current")
      : cycles.data?.find((cycle) => cycle.id === selectedCycleId)?.name;
  const activeSessions = sessions.data?.filter(
    (session) => session.status === "active",
  ).length;

  const meta = (row: AccountHubRow): Pick<AccountRow, "meta" | "metaMono"> => {
    switch (row.key) {
      case "reports":
        return {
          meta:
            holdsBadge && currentDay > 0
              ? t("reportDay", { day: currentDay })
              : undefined,
        };
      case "cycles":
        return { meta: viewedCycle };
      case "devices":
        return {
          meta:
            activeSessions === undefined
              ? undefined
              : t("signedIn", { count: activeSessions }),
        };
      case "device":
        return { meta: t("codeFormat"), metaMono: true };
      case "admin":
        return { meta: tNav("system") };
      default:
        return {};
    }
  };
  const withMeta = (row: AccountHubRow): AccountRow => ({
    ...row,
    ...meta(row),
  });
  const rows = accountRows(navItems);

  const access = membershipAccess(user);
  const membershipLabels =
    access.state === "held" ? access.badges.map(membershipBadgeName) : [];

  return (
    <AccountScreenView
      displayName={displayName(user)}
      initials={initials(user)}
      membershipLabels={membershipLabels}
      workspaceRows={rows.workspace.map(withMeta)}
      accountRows={rows.account.map(withMeta)}
      language={locale}
      onLanguageChange={setLocale}
      languagePending={isPending}
      theme={
        resolvedTheme === "light" || resolvedTheme === "dark"
          ? resolvedTheme
          : undefined
      }
      onThemeChange={setTheme}
      showSignInAgain={access.state === "needs_reconnect"}
      onSignInAgain={() => {
        void logout("/login");
      }}
      onFeedback={openFeedback}
      onLogout={() => {
        void logout();
      }}
    />
  );
}
