"use client";

import { Fragment, useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  SquareTerminal,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { PhoneLandingCta } from "@/components/phone/landing/phone-landing-cta";
import { PhoneLandingHeader } from "@/components/phone/landing/phone-landing-header";
import { APP_CONFIG } from "@/config";

/** The commands of each block, as `cli-page.tsx` exports them. */
export interface PhoneCliCommands {
  install: readonly string[];
  signIn: readonly string[];
  track: readonly string[];
  skill: readonly string[];
}

export interface PhoneCliProps {
  /** `cli-page.tsx`'s `INSTALL`, `SIGN_IN`, `TRACK`, `SKILL`: both trees copy the same text. */
  commands: PhoneCliCommands;
  /** `cli-page.tsx`'s `COPIED_MS`: how long a block says "Copied". */
  copiedMs: number;
}

const PROMPT = "$ ";
const NEWLINE = "\n";

const code = (chunks: ReactNode) => (
  <code className="ph-mono ph-clp-code">{chunks}</code>
);
const strong = (chunks: ReactNode) => <strong>{chunks}</strong>;

/** v3/Cli below md: today's words and commands in the board's layout, with v2/Landing's floating action. */
export function PhoneCli({ commands, copiedMs }: PhoneCliProps) {
  const t = useTranslations("cliPage");
  const tSignIn = useTranslations("auth.signIn");
  const tAccount = useTranslations("phone.account");
  const tLanding = useTranslations("phone.landing");
  const newTab = <span className="ph-sr">{tSignIn("opensInNewTab")}</span>;

  return (
    <div
      data-slot="cli-phone"
      className="ph-app relative flex min-h-viewport flex-col md:hidden"
    >
      <PhoneLandingHeader />

      <main>
        <section className="ph-landing-hero">
          <span aria-hidden="true" className="ph-clp-tile">
            <SquareTerminal size={26} />
          </span>
          <p className="ph-landing-eyebrow ph-clp-eyebrow">{t("eyebrow")}</p>
          <h1 className="ph-mono ph-clp-h1">{t("title")}</h1>
          <p className="ph-landing-lead">{t("lead")}</p>
          <a
            href={APP_CONFIG.cli.url}
            target="_blank"
            rel="noopener noreferrer"
            data-action="cli-pypi"
            className="ph-clp-pypi"
          >
            {t("pypi")}
            <ExternalLink size={16} aria-hidden="true" />
            {newTab}
          </a>
        </section>

        <PhoneCliSection
          block="install"
          title={t("installTitle")}
          commands={commands.install}
          copiedMs={copiedMs}
        >
          <p className="ph-clp-body">{t.rich("installBody", { code })}</p>
        </PhoneCliSection>

        <PhoneCliSection
          block="sign-in"
          title={t("signInTitle")}
          commands={commands.signIn}
          copiedMs={copiedMs}
        >
          <p className="ph-clp-body">{t("signInBody")}</p>
          <ul data-slot="cli-phone-modes" className="ph-clp-list">
            {(["signInBrowser", "signInManual", "signInDevice"] as const).map(
              (key) => (
                <li key={key} className="ph-clp-li">
                  <span aria-hidden="true" className="ph-clp-b" />
                  <span>{t.rich(key, { strong, code })}</span>
                </li>
              ),
            )}
          </ul>
        </PhoneCliSection>

        <PhoneCliSection
          block="track"
          title={t("trackTitle")}
          commands={commands.track}
          copiedMs={copiedMs}
        >
          <p className="ph-clp-body">{t.rich("trackBody", { code })}</p>
        </PhoneCliSection>

        <PhoneCliSection
          block="skill"
          title={t("skillTitle")}
          commands={commands.skill}
          copiedMs={copiedMs}
        >
          <p className="ph-clp-body">{t.rich("skillBody", { code })}</p>
        </PhoneCliSection>

        <PhoneCliMore title={t("moreTitle")}>
          <p className="ph-clp-more-p">{t("moreBody")}</p>
          <a
            href={APP_CONFIG.cli.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ph-clp-more-a"
          >
            {t("pypi")}
            <ArrowUpRight size={16} aria-hidden="true" />
            {newTab}
          </a>
        </PhoneCliMore>

        <p className="ph-clp-back">
          {t.rich("footer", {
            link: (chunks) => (
              <Link href="/" className="ph-clp-back-a">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </main>

      <footer className="ph-landing-footer ph-clp-footer">
        <Link
          href="/cookie-policy"
          className="flex min-h-11 items-center text-muted-foreground"
        >
          {tAccount("cookiePolicy")}
        </Link>
        <span className="flex min-h-11 items-center text-muted-foreground">
          {tLanding("copyright", { name: APP_CONFIG.name })}
        </span>
      </footer>

      <PhoneLandingCta />
    </div>
  );
}

function PhoneCliSection({
  block,
  title,
  commands,
  copiedMs,
  children,
}: {
  block: string;
  title: string;
  commands: readonly string[];
  copiedMs: number;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-slot="cli-phone-section"
      data-block={block}
      className="ph-clp-sec"
    >
      <h2 id={headingId} className="ph-clp-h">
        {title}
      </h2>
      {children}
      <PhoneCliTerm
        block={block}
        commands={commands}
        copiedMs={copiedMs}
        describedBy={headingId}
      />
    </section>
  );
}

function PhoneCliMore({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      data-slot="cli-phone-more"
      className="ph-clp-more"
    >
      <h2 id={headingId} className="ph-clp-more-h">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * One terminal block: the commands with a "$ " prompt that is never selected
 * or copied, and Copy, which copies `commands.join("\n")` (the desktop
 * block's text) and says "Copied" for `copiedMs`. A refused clipboard says
 * nothing, as the desktop block does: the commands stay selectable by hand.
 */
function PhoneCliTerm({
  block,
  commands,
  copiedMs,
  describedBy,
}: {
  block: string;
  commands: readonly string[];
  copiedMs: number;
  describedBy: string;
}) {
  const t = useTranslations("cliPage");
  const [copied, setCopied] = useState(false);
  const text = commands.join(NEWLINE);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), copiedMs);
    return () => window.clearTimeout(timer);
  }, [copied, copiedMs]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Refused: no "Copied"; the commands stay selectable.
    }
  };

  return (
    <>
      <div
        data-slot="cli-phone-term"
        data-block={block}
        className="ph-clp-term"
      >
        <pre data-slot="cli-phone-commands" className="ph-mono ph-hs">
          {commands.map((command, index) => (
            <Fragment key={command}>
              {index > 0 ? NEWLINE : null}
              <span aria-hidden="true" className="ph-clp-p">
                {PROMPT}
              </span>
              {command}
            </Fragment>
          ))}
        </pre>
        <button
          type="button"
          data-action="copy-commands"
          data-done={copied ? "true" : "false"}
          aria-label={copied ? t("copied") : t("copy")}
          aria-describedby={describedBy}
          className="ph-clp-copy"
          onClick={() => void copy()}
        >
          {copied ? (
            <Check size={18} strokeWidth={2.25} aria-hidden="true" />
          ) : (
            <Copy size={18} aria-hidden="true" />
          )}
        </button>
      </div>
      {/* Empty but mounted: a region inserted with its words may not announce. */}
      <p role="status" data-slot="cli-phone-copy-status" className="ph-sr">
        {copied ? t("copied") : ""}
      </p>
    </>
  );
}
