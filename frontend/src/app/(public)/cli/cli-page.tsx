"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { PhoneCli } from "@/components/phone/landing/phone-cli";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config";
import { cn } from "@/lib/utils";

export const COPIED_MS = 2000;

export const INSTALL = [
  "uv tool install applika-cli",
  "pipx install applika-cli",
];

export const SIGN_IN = [
  "applika login",
  "applika login --manual",
  "applika login --device",
  "applika whoami",
];

export const TRACK = [
  "applika applications list --mode active --status active",
  'applika applications new --company "Stripe" --role "Backend Engineer" \\\n  --platform LinkedIn --mode active --date 2026-11-08',
  "applika applications timeline add <id> --type interview --date 2026-11-12",
  "applika applications finalize <id>",
];

export const SKILL = ["applika skill", "applika skill --local"];

const code = (chunks: ReactNode) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">
    {chunks}
  </code>
);
const strong = (chunks: ReactNode) => (
  <strong className="font-semibold text-foreground">{chunks}</strong>
);

/** A terminal-styled block of shell commands with one copy button. */
function CommandBlock({ commands }: { commands: string[] }) {
  const t = useTranslations("cliPage");
  const [copied, setCopied] = useState(false);
  const text = commands.join("\n");

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard blocked: the block is still selectable by hand.
    }
  };

  return (
    <div className="relative mt-4 overflow-hidden rounded-xl border border-border/60 bg-surface shadow-card">
      <pre className="overflow-x-auto p-4 pr-12 font-mono text-[13px] leading-relaxed text-foreground">
        {commands.map((command) => (
          <div
            key={command}
            className="before:text-primary before:content-['$_'] before:select-none"
          >
            {command}
          </div>
        ))}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? t("copied") : t("copy")}
        className={cn(
          "absolute top-2.5 right-2.5 rounded-md p-1.5 text-muted-foreground transition-colors max-md:top-0.5 max-md:right-0.5 max-md:p-3.5",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-hidden",
        )}
      >
        {copied ? (
          <Check aria-hidden className="size-4 text-primary" />
        ) : (
          <Copy aria-hidden className="size-4" />
        )}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12 space-y-3">
      <h2 className="font-display text-lg font-semibold tracking-tight-display text-foreground md:text-xl">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * The applika-cli page: what the CLI does, how to install it, sign in, use it
 * and hand it to an AI assistant. Public, under the landing layout. The
 * commands stay English in both languages; only the prose translates.
 */
export function CliPage() {
  const t = useTranslations("cliPage");
  const body = "text-sm leading-relaxed text-muted-foreground";

  return (
    <>
      <PhoneCli
        commands={{
          install: INSTALL,
          signIn: SIGN_IN,
          track: TRACK,
          skill: SKILL,
        }}
        copiedMs={COPIED_MS}
      />
      <div data-slot="cli-desktop" className="hidden md:contents">
        <main className="relative mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-20">
          <header className="space-y-4 border-b border-border/60 pb-10">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Terminal aria-hidden className="size-5" />
            </div>
            <p className="font-display text-[11px] font-semibold tracking-wide-label text-primary uppercase">
              {t("eyebrow")}
            </p>
            <h1 className="font-mono text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {t("title")}
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-pretty text-muted-foreground">
              {t("lead")}
            </p>
            <Button
              asChild
              size="sm"
              className="gap-2 font-display font-medium max-md:h-11"
            >
              <a
                href={APP_CONFIG.cli.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("pypi")}
                <ExternalLink aria-hidden className="size-3.5" />
              </a>
            </Button>
          </header>

          <Section title={t("installTitle")}>
            <p className={body}>{t.rich("installBody", { code })}</p>
            <CommandBlock commands={INSTALL} />
          </Section>

          <Section title={t("signInTitle")}>
            <p className={body}>{t("signInBody")}</p>
            <ul className={cn(body, "list-disc space-y-1.5 pl-5")}>
              <li>{t.rich("signInBrowser", { strong, code })}</li>
              <li>{t.rich("signInManual", { strong, code })}</li>
              <li>{t.rich("signInDevice", { strong, code })}</li>
            </ul>
            <CommandBlock commands={SIGN_IN} />
          </Section>

          <Section title={t("trackTitle")}>
            <p className={body}>{t.rich("trackBody", { code })}</p>
            <CommandBlock commands={TRACK} />
          </Section>

          <Section title={t("skillTitle")}>
            <p className={body}>{t.rich("skillBody", { code })}</p>
            <CommandBlock commands={SKILL} />
          </Section>

          <Section title={t("moreTitle")}>
            <p className={body}>{t("moreBody")}</p>
            <a
              href={APP_CONFIG.cli.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-2 hover:text-foreground max-md:min-h-11"
            >
              {t("pypi")}
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          </Section>

          <footer className="mt-14 border-t border-border/60 pt-6 text-xs text-muted-foreground">
            {t.rich("footer", {
              link: (chunks) => (
                <Link
                  href="/"
                  className="font-medium text-primary underline underline-offset-2 hover:text-foreground max-md:inline-flex max-md:min-h-11 max-md:items-center"
                >
                  {chunks}
                </Link>
              ),
            })}
          </footer>
        </main>
      </div>
    </>
  );
}
