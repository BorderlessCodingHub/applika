"use client";

import { useId, useRef, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { McpCopyButton } from "@/components/mcp/mcp-copy-button";
import { MCP_SCOPE_CHOICES, MCP_SCOPE_OF } from "@/components/mcp/mcp-scope";
import { McpScopeChip } from "@/components/mcp/mcp-scope-chip";
import {
  MCP_APP_NAMES,
  MCP_PAGE_CAN,
  MCP_PAGE_CONTROL,
  MCP_PAGE_STEPS,
  MCP_TAB_HREF,
  PhoneMcp,
} from "@/components/phone/landing/phone-mcp";
import { APP_CONFIG } from "@/config";
import { cn } from "@/lib/utils";

/** The example call in the hero card: a tool name, the same in every language. */
const EXAMPLE_TOOL = "applika · add_timeline_event";

/**
 * DeskMcpPage.dc.html's classes. The column is the landing page's and the
 * header's (`max-w-5xl`, `px-5 md:px-8`), so the content lines up with them.
 */
const WRAP = "mx-auto box-border w-full max-w-5xl px-5 md:px-8";
const SEC_H = "m-0 text-[28px] font-bold tracking-[-0.02em] text-foreground";
const BODY = "mt-2.5 mb-0 text-base leading-[1.6] text-muted-foreground";
const CARD = "rounded-2xl bg-surface p-5 shadow-card";
const LI =
  "flex items-start gap-3 text-[15px] leading-[1.55] text-muted-foreground";
const BULLET = "mt-[9px] size-1.5 shrink-0 rounded-full bg-primary";
const STEP_N =
  "flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-muted text-[14px] font-bold text-accent-foreground";
const GRID3 =
  "m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-4 p-0";

const strong = (chunks: ReactNode) => (
  <strong className="font-semibold text-foreground">{chunks}</strong>
);
const code = (chunks: ReactNode) => (
  <code className="rounded-md bg-muted px-1.5 py-px font-numeric text-[13px] text-foreground">
    {chunks}
  </code>
);

/**
 * `/mcp`: what the Applika MCP server does, which apps it works with and how
 * to connect in three steps, then a link to Profile › MCP. Public, under the
 * landing layout; one tree per width.
 */
export function McpPage() {
  const endpoint = APP_CONFIG.mcp.endpoint;
  return (
    <>
      <PhoneMcp endpoint={endpoint} />
      <div data-slot="mcp-desktop" className="hidden md:contents">
        <McpDesktop endpoint={endpoint} />
      </div>
    </>
  );
}

function McpDesktop({ endpoint }: { endpoint: string }) {
  const t = useTranslations("mcpPage");
  const ids = useId();
  const id = (section: string) => `${ids}-${section}`;
  const addressRef = useRef<HTMLPreElement>(null);

  return (
    // The board's text keeps the UA line height unless it sets its own.
    <main className="relative flex flex-col pb-24 leading-[normal]">
      <section
        className={cn(WRAP, "flex flex-wrap items-center gap-12 pt-[72px]")}
      >
        <div className="min-w-0 flex-[1_1_440px]">
          <p className="m-0 text-[14px] font-semibold text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2.5 mb-0 text-[52px] leading-[1.05] font-bold tracking-[-0.03em] text-foreground">
            {t("title")}
          </h1>
          <p className="mt-5 mb-0 max-w-[540px] text-lg leading-[1.6] text-muted-foreground">
            {t("lead")}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link
              href={MCP_TAB_HREF}
              data-action="mcp-create-token"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-[22px] text-[15px] font-semibold whitespace-nowrap text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:shadow-glow"
            >
              {t("cta")}
            </Link>
            <span className="text-[13px] text-muted-foreground">
              {t("ctaNote")}
            </span>
          </div>
        </div>
        <figure
          aria-label={t("exampleLabel")}
          className="m-0 flex min-w-0 flex-[1_1_400px] flex-col gap-3 rounded-2xl bg-surface p-5 shadow-elevated"
        >
          <p className="m-0 max-w-[85%] self-end rounded-[14px] bg-primary-muted px-3.5 py-3 text-sm leading-normal text-foreground">
            {t("exampleAsk")}
          </p>
          <p className="m-0 rounded-[10px] bg-muted px-3 py-2.5 font-numeric text-[12px] text-muted-foreground">
            {EXAMPLE_TOOL}
          </p>
          <p className="m-0 max-w-[90%] rounded-[14px] border border-border bg-background px-3.5 py-3 text-sm leading-normal text-foreground">
            {t.rich("exampleReply", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </figure>
      </section>

      <section aria-labelledby={id("how")} className={cn(WRAP, "pt-24")}>
        <h2 id={id("how")} className={SEC_H}>
          {t("stepsTitle")}
        </h2>
        <ol className={cn(GRID3, "mt-6")}>
          {MCP_PAGE_STEPS.map((step, index) => (
            <li key={step} className={cn(CARD, "flex flex-col gap-2.5")}>
              <span aria-hidden="true" className={STEP_N}>
                {index + 1}
              </span>
              <h3 className="m-0 text-[17px] font-bold text-foreground">
                {t(`steps.${step}.title`)}
              </h3>
              <p className="m-0 text-sm leading-[1.55] text-muted-foreground">
                {t(`steps.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <div className={cn(WRAP, "flex flex-wrap gap-12 pt-24")}>
        <section
          aria-labelledby={id("addr")}
          className="min-w-0 flex-[1_1_420px]"
        >
          <h2 id={id("addr")} className={SEC_H}>
            {t("addressTitle")}
          </h2>
          <p className={BODY}>{t.rich("addressBody", { code })}</p>
          <div
            data-slot="mcp-desktop-address"
            className="mt-4 flex items-center gap-1 rounded-xl border border-border bg-surface py-1 pr-1 shadow-card"
          >
            <pre
              ref={addressRef}
              className="m-0 min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto py-2.5 pl-4 font-numeric text-[14px] whitespace-pre text-foreground [&::-webkit-scrollbar]:hidden"
            >
              {endpoint}
            </pre>
            <McpCopyButton
              variant="desk-text"
              size="lg"
              text={endpoint}
              label={t("copyAddress")}
              doneLabel={t("addressCopied")}
              selectOnFail={addressRef}
              data-action="copy-address"
            />
          </div>
        </section>
        <section
          aria-labelledby={id("apps")}
          className="min-w-0 flex-[1_1_420px]"
        >
          <h2 id={id("apps")} className={SEC_H}>
            {t("appsTitle")}
          </h2>
          <p className={BODY}>{t("appsBody")}</p>
          <ul className="mt-4 mb-0 grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 p-0">
            {MCP_APP_NAMES.map((name) => (
              <li
                key={name}
                className="flex min-h-[52px] items-center rounded-xl bg-surface px-4 text-[15px] font-semibold text-foreground shadow-card"
              >
                {name}
              </li>
            ))}
          </ul>
          <p className={cn(BODY, "text-[13px]")}>{t("appsLater")}</p>
        </section>
      </div>

      <div className={cn(WRAP, "flex flex-wrap gap-12 pt-24")}>
        <section
          aria-labelledby={id("can")}
          className="min-w-0 flex-[1_1_420px]"
        >
          <h2 id={id("can")} className={SEC_H}>
            {t("canTitle")}
          </h2>
          <ul className="mt-5 mb-0 flex list-none flex-col gap-3.5 p-0">
            {MCP_PAGE_CAN.map((item) => (
              <li key={item} className={LI}>
                <span aria-hidden="true" className={BULLET} />
                <span>{t.rich(`can.${item}`, { strong })}</span>
              </li>
            ))}
          </ul>
        </section>
        <section
          aria-labelledby={id("scope")}
          className="min-w-0 flex-[1_1_420px]"
        >
          <h2 id={id("scope")} className={SEC_H}>
            {t("reachTitle")}
          </h2>
          <div className="mt-5 flex flex-col gap-2">
            {MCP_SCOPE_CHOICES.map((choice) => (
              <div
                key={choice}
                className="flex flex-wrap items-center gap-3.5 rounded-2xl bg-surface px-4 py-3.5 shadow-card"
              >
                <McpScopeChip
                  scope={MCP_SCOPE_OF[choice]}
                  className="h-6 px-[9px]"
                />
                <span className="text-[14px] text-muted-foreground">
                  {t(`reach.${choice}`)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby={id("safe")} className={cn(WRAP, "pt-24")}>
        <h2 id={id("safe")} className={SEC_H}>
          {t("controlTitle")}
        </h2>
        <ul className={cn(GRID3, "mt-5")}>
          {MCP_PAGE_CONTROL.map((item) => (
            <li
              key={item}
              className={cn(
                CARD,
                "text-[15px] leading-[1.55] text-muted-foreground",
              )}
            >
              {t.rich(`control.${item}`, { strong })}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
