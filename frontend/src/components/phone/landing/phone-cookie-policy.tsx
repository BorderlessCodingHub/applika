"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { PhonePill } from "@/components/phone/phone-pill";
import { PhonePublicBar } from "@/components/phone/phone-public-bar";
import { APP_CONFIG } from "@/config";

export interface CookieRow {
  name: string;
  purpose: string;
  duration: string;
  type: string;
}

export interface PhoneCookiePolicyProps {
  /** "Last updated: …", already formatted in the active language. */
  lastUpdated: string;
  /** The same rows the desktop table lists, in its order. */
  cookies: readonly CookieRow[];
}

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

/** v2/CookiePolicy below md: today's policy words in the board's layout. */
export function PhoneCookiePolicy({
  lastUpdated,
  cookies,
}: PhoneCookiePolicyProps) {
  const t = useTranslations("cookies.policy");
  return (
    <div data-slot="cookie-policy-phone" className="ph-app relative md:hidden">
      <PhonePublicBar />
      <main className="ph-doc px-5 pt-1 pb-12">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-primary uppercase">
          {t("eyebrow")}
        </p>
        <h1 className="ph-h1 mt-1.5">{t("title")}</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {lastUpdated}
        </p>

        <h2>{t("whatTitle")}</h2>
        <p>{t("whatBody")}</p>

        <h2>{t("usedTitle")}</h2>
        <p>{t.rich("usedBody", { name: APP_CONFIG.name, strong })}</p>
        <ul className="mt-3.5 mb-0 flex list-none flex-col gap-2.5 p-0">
          {cookies.map((cookie) => (
            <li
              key={cookie.name}
              data-slot="cookie-row"
              data-cookie={cookie.name}
              className="ph-ck"
            >
              <div className="flex min-w-0 justify-between gap-2">
                <code className="ph-mono text-[14px] font-bold">
                  {cookie.name}
                </code>
                <PhonePill>{cookie.type}</PhonePill>
              </div>
              <p className="text-[14px]">{cookie.purpose}</p>
              <p className="text-[13px] text-muted-foreground">
                {cookie.duration}
              </p>
            </li>
          ))}
        </ul>

        <h2>{t("thirdPartyTitle")}</h2>
        <p>{t("thirdPartyBody", { name: APP_CONFIG.name })}</p>

        <h2>{t("managingTitle")}</h2>
        <p>{t("managingBody")}</p>
        <p className="mt-2">{t("managingLocale")}</p>

        <h2>{t("changesTitle")}</h2>
        <p>{t("changesBody")}</p>
      </main>
    </div>
  );
}
