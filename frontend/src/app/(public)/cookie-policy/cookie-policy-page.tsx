"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { APP_CONFIG } from "@/config";

/** The day this policy last changed (the language cookie was added). */
const LAST_UPDATED = new Date(Date.UTC(2026, 9, 31));

type CookieRow = {
  name: string;
  purpose: string;
  duration: string;
  type: string;
};

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

/**
 * The cookie policy. A client component so its words follow the chosen
 * language (`cookies.policy`); the route's metadata in `page.tsx` stays
 * English.
 */
export function CookiePolicyPage() {
  const t = useTranslations("cookies.policy");
  const format = useFormatter();

  const cookies: CookieRow[] = [
    {
      name: "__access",
      purpose: t("accessPurpose"),
      duration: t("accessDuration"),
      type: t("typeNecessary"),
    },
    {
      name: "__refresh",
      purpose: t("refreshPurpose"),
      duration: t("refreshDuration"),
      type: t("typeNecessary"),
    },
    {
      name: "NEXT_LOCALE",
      purpose: t("localePurpose"),
      duration: t("localeDuration"),
      type: t("typePreference"),
    },
  ];

  return (
    <main className="relative mx-auto max-w-3xl px-5 py-14 md:px-8 md:py-20">
      <header className="mb-10 space-y-2 border-b border-border/60 pb-8">
        <p className="font-display text-[11px] font-semibold tracking-wide-label text-primary uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight-display text-balance text-foreground md:text-4xl">
          {t("title")}
        </h1>
        <p className="font-numeric text-xs text-muted-foreground">
          {t("lastUpdated", {
            date: format.dateTime(LAST_UPDATED, {
              dateStyle: "long",
              timeZone: "UTC",
            }),
          })}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          {t("whatTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("whatBody")}
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          {t("usedTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t.rich("usedBody", { name: APP_CONFIG.name, strong })}
        </p>

        <div className="mt-2 overflow-x-auto rounded-xl border border-border/60 bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-[11px] tracking-wide-label text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{t("columnName")}</th>
                <th className="px-4 py-2.5 font-semibold">
                  {t("columnPurpose")}
                </th>
                <th className="px-4 py-2.5 font-semibold">
                  {t("columnDuration")}
                </th>
                <th className="px-4 py-2.5 font-semibold">{t("columnType")}</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((c) => (
                <tr
                  key={c.name}
                  className="border-t border-border/60 align-top"
                >
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-foreground">
                    {c.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.purpose}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.duration}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {c.type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          {t("thirdPartyTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("thirdPartyBody", { name: APP_CONFIG.name })}
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          {t("managingTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("managingBody")}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("managingLocale")}
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
          {t("changesTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("changesBody")}
        </p>
      </section>

      <footer className="mt-12 border-t border-border/60 pt-6 text-xs text-muted-foreground">
        {t.rich("footer", {
          link: (chunks) => (
            <Link
              href="/"
              className="font-medium text-primary underline underline-offset-2 hover:text-foreground"
            >
              {chunks}
            </Link>
          ),
        })}
      </footer>
    </main>
  );
}
