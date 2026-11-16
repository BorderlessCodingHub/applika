"use client";

import { useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { MCP_CLIENTS, MCP_CLIENT_LABEL } from "@/components/mcp/mcp-configs";
import { McpCopyButton } from "@/components/mcp/mcp-copy-button";
import { McpIcon } from "@/components/mcp/mcp-icon";
import { MCP_SCOPE_CHOICES, MCP_SCOPE_OF } from "@/components/mcp/mcp-scope";
import { McpScopeChip } from "@/components/mcp/mcp-scope-chip";
import { PhoneLandingHeader } from "@/components/phone/landing/phone-landing-header";
import { APP_CONFIG } from "@/config";

/** Where "Create a token" lands; sign-in comes back here (`RETURN_TO_PATHS`). */
export const MCP_TAB_HREF = "/profile?tab=mcp";

/** The apps the token result writes a configuration for ("Other" is not an app). */
export const MCP_APP_NAMES = MCP_CLIENTS.flatMap((client) => {
  const label = MCP_CLIENT_LABEL[client];
  return label ? [label] : [];
});

export const MCP_PAGE_STEPS = ["create", "copy", "paste"] as const;
export const MCP_PAGE_CAN = [
  "applications",
  "timeline",
  "cvs",
  "lookups",
] as const;
export const MCP_PAGE_CONTROL = ["devices", "ends", "own"] as const;

const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

export interface PhoneMcpProps {
  /** `APP_CONFIG.mcp.endpoint`. */
  endpoint: string;
}

/** McpPage.dc.html below md, under v2/Landing's public phone header. */
export function PhoneMcp({ endpoint }: PhoneMcpProps) {
  const t = useTranslations("mcpPage");
  const tAccount = useTranslations("phone.account");
  const tLanding = useTranslations("phone.landing");
  const addressRef = useRef<HTMLPreElement>(null);
  const ids = useId();
  const id = (section: string) => `${ids}-${section}`;
  const code = (chunks: ReactNode) => (
    <code className="ph-mono ph-mcp-code">{chunks}</code>
  );

  return (
    <div
      data-slot="mcp-phone"
      className="ph-app relative flex min-h-viewport flex-col md:hidden"
    >
      <PhoneLandingHeader />

      <main>
        <section className="ph-landing-hero">
          <span aria-hidden="true" className="ph-mcp-tile">
            <McpIcon size={26} />
          </span>
          <p className="ph-landing-eyebrow ph-mcp-eyebrow">{t("eyebrow")}</p>
          <h1 className="ph-mcp-h1">{t("title")}</h1>
          <p className="ph-landing-lead">{t("lead")}</p>
          <Link
            href={MCP_TAB_HREF}
            data-action="mcp-create-token"
            className="ph-mcp-cta"
          >
            {t("cta")}
          </Link>
          <p className="ph-mcp-cta-note">{t("ctaNote")}</p>
        </section>

        <section aria-labelledby={id("how")} className="ph-mcp-sec">
          <h2 id={id("how")} className="ph-mcp-h">
            {t("stepsTitle")}
          </h2>
          <ol className="ph-mcp-steps">
            {MCP_PAGE_STEPS.map((step, index) => (
              <li key={step} className="ph-mcp-step">
                <span aria-hidden="true" className="ph-mcp-n">
                  {index + 1}
                </span>
                <div>
                  <h3>{t(`steps.${step}.title`)}</h3>
                  <p>{t(`steps.${step}.body`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby={id("addr")} className="ph-mcp-sec">
          <h2 id={id("addr")} className="ph-mcp-h">
            {t("addressTitle")}
          </h2>
          <p className="ph-mcp-body">{t.rich("addressBody", { code })}</p>
          <div data-slot="mcp-phone-address" className="ph-mcp-term">
            <pre ref={addressRef} className="ph-mono ph-hs">
              {endpoint}
            </pre>
            <McpCopyButton
              variant="phone"
              className="ph-mcp-copy"
              text={endpoint}
              label={t("copyAddress")}
              doneLabel={t("addressCopied")}
              selectOnFail={addressRef}
              data-action="copy-address"
            />
          </div>
        </section>

        <section aria-labelledby={id("apps")} className="ph-mcp-sec">
          <h2 id={id("apps")} className="ph-mcp-h">
            {t("appsTitle")}
          </h2>
          <p className="ph-mcp-body">{t("appsBody")}</p>
          <ul className="ph-mcp-apps">
            {MCP_APP_NAMES.map((name) => (
              <li key={name} className="ph-mcp-app">
                {name}
              </li>
            ))}
          </ul>
          <p className="ph-mcp-body ph-mcp-small">{t("appsLater")}</p>
        </section>

        <section aria-labelledby={id("can")} className="ph-mcp-sec">
          <h2 id={id("can")} className="ph-mcp-h">
            {t("canTitle")}
          </h2>
          <ul className="ph-mcp-list">
            {MCP_PAGE_CAN.map((item) => (
              <li key={item} className="ph-mcp-li">
                <span aria-hidden="true" className="ph-mcp-b" />
                <span>{t.rich(`can.${item}`, { strong })}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby={id("scope")} className="ph-mcp-sec">
          <h2 id={id("scope")} className="ph-mcp-h">
            {t("reachTitle")}
          </h2>
          <div className="ph-mcp-reach">
            {MCP_SCOPE_CHOICES.map((choice) => (
              <div key={choice} className="ph-card ph-mcp-reach-card">
                <McpScopeChip variant="phone" scope={MCP_SCOPE_OF[choice]} />
                <span className="ph-mcp-reach-b">{t(`reach.${choice}`)}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby={id("safe")} className="ph-mcp-sec">
          <h2 id={id("safe")} className="ph-mcp-h">
            {t("controlTitle")}
          </h2>
          <ul className="ph-mcp-list">
            {MCP_PAGE_CONTROL.map((item) => (
              <li key={item} className="ph-mcp-li">
                <span aria-hidden="true" className="ph-mcp-b" />
                <span>{t.rich(`control.${item}`, { strong })}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="ph-mcp-foot">
        <div className="ph-mcp-foot-links">
          <Link href="/">{t("footerHome")}</Link>
          <Link href="/cookie-policy">{tAccount("cookiePolicy")}</Link>
        </div>
        <span>{tLanding("copyright", { name: APP_CONFIG.name })}</span>
      </footer>
    </div>
  );
}
