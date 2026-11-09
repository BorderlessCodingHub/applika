"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, CircleAlert, Copy, SquareTerminal } from "lucide-react";
import { useTranslations } from "next-intl";

import { ApplikaIcon } from "@/components/app-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CLI_CODE_COPIED_MS = 2000;

/** `null` when either half is missing or blank. */
export function cliCodeValue(
  code: string | null | undefined,
  state: string | null | undefined,
): string | null {
  return code && state ? `${code}#${state}` : null;
}

type CopyState = "idle" | "copied" | "failed";

export interface CliCodeScreenProps {
  code: string | null | undefined;
  state: string | null | undefined;
}

export function CliCodeScreen({ code, state }: CliCodeScreenProps) {
  const t = useTranslations("cliCode");
  const value = cliCodeValue(code, state);

  return (
    <div className="relative min-h-viewport bg-background">
      {/* One language + theme pair, top-right at both widths. */}
      <div className="ph-pair absolute top-4 right-4 z-10 flex items-center gap-2">
        <LanguageToggle variant="default" />
        <ThemeToggle />
      </div>

      <div
        data-slot="cli-code-phone"
        data-state={value ? "ready" : "missing"}
        className="ph-app flex min-h-viewport flex-col md:hidden"
      >
        <main className="flex flex-1 flex-col items-center justify-center px-6 py-18 text-center">
          <span className="flex size-16 items-center justify-center rounded-[20px] bg-surface text-primary shadow-card">
            <SquareTerminal size={30} aria-hidden="true" />
          </span>
          <h1 className="ph-h1 mt-6 text-[28px]">{t("title")}</h1>
          {value ? (
            <PhoneCliCodeValue value={value} />
          ) : (
            <PhoneCliCodeMissing />
          )}
        </main>
      </div>

      <div
        data-slot="cli-code-desktop"
        className="noise-overlay relative hidden min-h-viewport items-center justify-center bg-background p-4 pt-18 md:flex md:pt-4"
      >
        <div aria-hidden className="absolute inset-0 gradient-mesh" />
        <div aria-hidden className="absolute inset-0 dot-grid opacity-30" />

        <main className="relative w-full max-w-md animate-fade-in-up motion-reduce:animate-none">
          <div
            data-slot="cli-code"
            data-state={value ? "ready" : "missing"}
            className="flex flex-col rounded-2xl border border-border/60 bg-surface-elevated p-6 shadow-elevated sm:p-10"
          >
            <ApplikaIcon
              aria-hidden
              className="size-10 self-center text-primary"
            />
            <h1 className="mt-4 text-center font-display text-2xl font-bold tracking-tight-display text-balance text-foreground">
              {t("title")}
            </h1>
            {value ? <CliCodeValue value={value} /> : <CliCodeMissing />}
          </div>
        </main>
      </div>
    </div>
  );
}

/** Copy, else select the code for the keyboard; "copied" falls back to idle. */
function useCliCodeCopy(value: string) {
  const codeRef = useRef<HTMLElement>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  useEffect(() => {
    if (copyState !== "copied") return;
    const timer = window.setTimeout(
      () => setCopyState("idle"),
      CLI_CODE_COPIED_MS,
    );
    return () => window.clearTimeout(timer);
  }, [copyState]);

  const selectCode = () => {
    const node = codeRef.current;
    const selection = window.getSelection();
    if (!node || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    selection.removeAllRanges();
    selection.addRange(range);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      selectCode();
      setCopyState("failed");
    }
  };

  return { codeRef, copyState, copy };
}

function CliCodeValue({ value }: { value: string }) {
  const t = useTranslations("cliCode");
  const instructionId = useId();
  const { codeRef, copyState, copy } = useCliCodeCopy(value);
  const copied = copyState === "copied";

  return (
    <>
      <p
        id={instructionId}
        className="mt-2 text-center text-sm text-muted-foreground"
      >
        {t("instruction")}
      </p>
      <code
        ref={codeRef}
        data-slot="cli-code-value"
        className="mt-6 block rounded-lg border border-border bg-muted/60 px-4 py-3 font-mono text-sm leading-relaxed break-all text-foreground select-all"
      >
        {value}
      </code>
      <Button
        type="button"
        size="lg"
        aria-describedby={instructionId}
        onClick={() => void copy()}
        className="mt-4 w-full"
      >
        {copied ? (
          <Check aria-hidden data-icon="inline-start" />
        ) : (
          <Copy aria-hidden data-icon="inline-start" />
        )}
        {copied ? t("copied") : t("copy")}
      </Button>
      <p
        role="status"
        data-slot="cli-code-status"
        className="text-center text-sm text-foreground [&:not(:empty)]:mt-3"
      >
        {copied
          ? t("copiedStatus")
          : copyState === "failed"
            ? t("copyFailed")
            : null}
      </p>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        {t("expiry")}
      </p>
    </>
  );
}

function CliCodeMissing() {
  const t = useTranslations("cliCode");
  return (
    <div
      data-slot="cli-code-missing"
      className="mt-6 flex items-start gap-3 rounded-lg border border-border bg-muted/60 p-4 text-left text-sm"
    >
      <CircleAlert
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-foreground">{t("missingTitle")}</p>
        <p className="text-foreground/80">{t("missingBody")}</p>
      </div>
    </div>
  );
}

/** v2/CliCode: the code block, Copy (Copied once done) and the expiry hint. */
function PhoneCliCodeValue({ value }: { value: string }) {
  const t = useTranslations("cliCode");
  const instructionId = useId();
  const { codeRef, copyState, copy } = useCliCodeCopy(value);
  const copied = copyState === "copied";
  const failed = copyState === "failed";

  return (
    <>
      <p id={instructionId} className="ph-lead">
        {t("instruction")}
      </p>
      <code
        ref={codeRef}
        data-slot="cli-code-value"
        className="ph-mono ph-cli-code block"
      >
        {value}
      </code>
      <button
        type="button"
        aria-describedby={instructionId}
        onClick={() => void copy()}
        className="ph-btn ph-pri mt-3.5 h-14 w-full"
      >
        {copied ? (
          <Check size={18} strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <Copy size={18} aria-hidden="true" />
        )}
        {copied ? t("copied") : t("copy")}
      </button>
      {/* The board says "copied" to screen readers only; a failed copy is shown. */}
      <p
        role="status"
        data-slot="cli-code-status"
        className={cn(failed ? "ph-hint mt-3" : "ph-sr")}
      >
        {copied ? t("copiedStatus") : failed ? t("copyFailed") : null}
      </p>
      <p className="ph-hint mt-4">{t("expiry")}</p>
    </>
  );
}

function PhoneCliCodeMissing() {
  const t = useTranslations("cliCode");
  return (
    <div
      data-slot="cli-code-missing"
      className="ph-card mt-7 flex w-full items-start gap-2.5 text-start text-[14px] leading-[1.45]"
    >
      <CircleAlert
        size={18}
        aria-hidden="true"
        className="mt-px flex-none text-muted-foreground"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="m-0 font-semibold">{t("missingTitle")}</p>
        <p className="m-0 text-muted-foreground">{t("missingBody")}</p>
      </div>
    </div>
  );
}
