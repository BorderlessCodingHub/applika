"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, CircleAlert, Copy } from "lucide-react";
import { useTranslations } from "next-intl";

import { ApplikaIcon } from "@/components/app-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

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
    <div className="noise-overlay relative flex min-h-viewport items-center justify-center bg-background p-4 pt-18 md:pt-4">
      <div aria-hidden className="absolute inset-0 gradient-mesh" />
      <div aria-hidden className="absolute inset-0 dot-grid opacity-30" />

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <ThemeToggle />
      </div>

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
  );
}

function CliCodeValue({ value }: { value: string }) {
  const t = useTranslations("cliCode");
  const instructionId = useId();
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
