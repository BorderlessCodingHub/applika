"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  SquareTerminal,
} from "lucide-react";

import { ApplikaIcon } from "@/components/app-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/** The codes the API sends to `/login?error=`, plus the web's own AUTH-1049. */
export const SIGN_IN_ERROR_CODES = [
  "AUTH-1003",
  "AUTH-1005",
  "AUTH-1006",
  "AUTH-1007",
  "AUTH-1008",
  "AUTH-1017",
  "AUTH-1018",
  "AUTH-1019",
  "AUTH-1046",
  "AUTH-1047",
  "AUTH-1048",
  "AUTH-1049",
  "GEN-1005",
] as const;

export type SignInErrorCode = (typeof SIGN_IN_ERROR_CODES)[number];

/** Listed codes only: the value comes from the URL, and some `errors.*` need ICU arguments. */
export function signInErrorKey(
  code: string | null | undefined,
): SignInErrorCode | "unknown" | null {
  if (!code) return null;
  return (SIGN_IN_ERROR_CODES as readonly string[]).includes(code)
    ? (code as SignInErrorCode)
    : "unknown";
}

export interface SignInScreenProps {
  /** Never called while `pending`. */
  onSignIn: () => void;
  /** Keep it true until the browser leaves; reset it on a bfcache restore. */
  pending?: boolean;
  /** The `?error=` value, as read from the URL. */
  errorCode?: string | null;
  /** `?cli=1`: the attempt came from `applika login`. */
  cli?: boolean;
  /** Borderless sign-up page (`config.ts`). */
  createAccountHref: string;
  /** On mount, focus the error when there is one, else the button. */
  autoFocus?: boolean;
}

export function SignInScreen({
  onSignIn,
  pending = false,
  errorCode = null,
  cli = false,
  createAccountHref,
  autoFocus = true,
}: SignInScreenProps) {
  const t = useTranslations("auth.signIn");
  const tErrors = useTranslations("errors");
  const leadId = useId();
  const newTabId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const errorKey = signInErrorKey(errorCode);

  useEffect(() => {
    if (!autoFocus) return;
    (errorKey ? errorRef.current : buttonRef.current)?.focus();
  }, [autoFocus, errorKey]);

  const cliRetry: ReactNode = t.rich("cliRetry", {
    command: t("cliCommand"),
    code: (chunks) => (
      <code className="rounded-sm bg-background/70 px-1 py-px font-mono text-[0.8125rem] whitespace-nowrap">
        {chunks}
      </code>
    ),
  });

  return (
    <div className="noise-overlay relative flex min-h-viewport items-center justify-center bg-background p-4 pt-18 md:pt-4">
      <div aria-hidden className="absolute inset-0 gradient-mesh" />
      <div aria-hidden className="absolute inset-0 dot-grid opacity-30" />

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <LanguageToggle variant="default" />
        <ThemeToggle />
      </div>

      <main className="relative w-full max-w-md animate-fade-in-up motion-reduce:animate-none">
        <div
          data-slot="sign-in"
          data-mode={cli ? "cli" : "web"}
          data-pending={pending || undefined}
          className="flex flex-col rounded-2xl border border-border/60 bg-surface-elevated p-6 shadow-elevated sm:p-10"
        >
          <ApplikaIcon
            aria-hidden
            className="size-10 self-center text-primary"
          />
          <h1 className="mt-4 text-center font-display text-2xl font-bold tracking-tight-display text-balance text-foreground">
            {t("title")}
          </h1>
          <p
            id={leadId}
            className="mt-2 text-center text-sm text-pretty text-foreground/70"
          >
            {t("lead")}
          </p>

          <div className="mt-6 flex flex-col">
            <div
              role="alert"
              data-slot="sign-in-error"
              data-code={errorKey ?? undefined}
              className="[&:not(:empty)]:mb-4"
            >
              {errorKey ? (
                <div
                  ref={errorRef}
                  tabIndex={-1}
                  className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground outline-none"
                >
                  <CircleAlert
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                  />
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-medium break-words">
                      {tErrors(errorKey)}
                    </p>
                    {cli ? (
                      <p
                        data-slot="sign-in-cli-hint"
                        className="text-foreground/80"
                      >
                        {cliRetry}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            {cli && !errorKey ? (
              <p
                data-slot="sign-in-cli-hint"
                className="mb-4 flex items-start gap-2.5 rounded-lg border border-border bg-muted/60 px-3 py-2.5 text-sm text-foreground"
              >
                <SquareTerminal
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-foreground/70"
                />
                <span className="min-w-0">{cliRetry}</span>
              </p>
            ) : null}

            <Button
              ref={buttonRef}
              type="button"
              size="lg"
              data-action="sign-in-borderless"
              aria-describedby={leadId}
              aria-disabled={pending || undefined}
              aria-busy={pending || undefined}
              onClick={() => {
                if (!pending) onSignIn();
              }}
              className="h-auto min-h-11 w-full px-4 py-2 font-display text-[0.9375rem] font-semibold whitespace-normal glow-primary aria-disabled:cursor-progress aria-disabled:opacity-70 sm:px-6 sm:text-base"
            >
              {pending ? (
                <LoaderCircle
                  aria-hidden
                  data-icon="inline-start"
                  className="motion-safe:animate-spin"
                />
              ) : null}
              {t("signInWithBorderless")}
            </Button>
            <span
              role="status"
              data-slot="sign-in-pending-status"
              className="sr-only"
            >
              {pending ? t("pending") : null}
            </span>
          </div>

          <Separator className="my-6" />

          <p className="text-center text-sm text-foreground/70">
            {t("noAccount")}{" "}
            <a
              href={createAccountHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={newTabId}
              data-slot="create-borderless-account"
              className="inline-flex items-center gap-1 rounded-sm font-medium text-foreground underline decoration-primary/60 underline-offset-4 outline-none hover:decoration-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {t("createAccount")}
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
            <span id={newTabId} className="sr-only">
              {t("opensInNewTab")}
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
