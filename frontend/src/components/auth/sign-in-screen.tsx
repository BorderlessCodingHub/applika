"use client";

import { useId, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, KeyRound, SquareTerminal } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";

import { ApplikaIcon } from "@/components/app-logo";
import {
  BorderlessCredentialFields,
  BorderlessFormError,
  PendingSubmitButton,
  type BorderlessCredentialsValues,
} from "@/components/auth/borderless-credentials";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Form } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { liveCopy } from "@/i18n/translator";

/** The sign-in screen's words (`auth.signIn.*`), in the active language. */
export const SIGN_IN_COPY = liveCopy("auth.signIn", [
  "title",
  "cliTitle",
  "lead",
  "cliCommand",
  "submit",
  "passwordHint",
  "noAccount",
  "createAccount",
  "opensInNewTab",
  "cliExpiredHint",
]);

export type SignInMode = "web" | "cli";

export interface SignInScreenProps {
  form: UseFormReturn<BorderlessCredentialsValues>;
  /** Called only while not pending. */
  onSubmit: (values: BorderlessCredentialsValues) => void;
  /** `cli`: the page was opened by `applika login` (`/login?cli=1`). */
  mode?: SignInMode;
  /** Keep it true until the browser leaves the page. */
  pending?: boolean;
  /** The server's `detail`, verbatim. */
  error?: string | null;
  /** A second line under the error, e.g. `SIGN_IN_COPY.cliExpiredHint`. */
  errorHint?: string | null;
  /** Borderless sign-up page (`config.ts`). */
  createAccountHref: string;
  autoFocus?: boolean;
}

export function SignInScreen({
  form,
  onSubmit,
  mode = "web",
  pending = false,
  error = null,
  errorHint = null,
  createAccountHref,
  autoFocus = true,
}: SignInScreenProps) {
  const t = useTranslations("auth.signIn");
  const titleId = useId();
  const newTabId = useId();
  const cli = mode === "cli";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (pending) {
      event.preventDefault();
      return;
    }
    void form.handleSubmit(onSubmit)(event);
  };

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
          data-mode={mode}
          className="flex flex-col rounded-2xl border border-border/60 bg-surface-elevated p-6 shadow-elevated sm:p-10"
        >
          <ApplikaIcon
            aria-hidden
            className="size-10 self-center text-primary"
          />
          <h1
            id={titleId}
            className="mt-4 text-center font-display text-2xl font-bold tracking-tight-display text-balance text-foreground"
          >
            {cli ? t("cliTitle") : t("title")}
          </h1>
          <p className="mt-2 text-center text-sm text-foreground/70">
            {t("lead")}
          </p>

          {cli ? (
            <p
              data-slot="sign-in-cli-note"
              className="mt-5 flex items-start gap-2.5 rounded-lg border border-border bg-muted/60 px-3 py-2.5 text-sm text-foreground"
            >
              <SquareTerminal
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-foreground/70"
              />
              <span className="min-w-0">
                {t.rich("cliNote", {
                  command: t("cliCommand"),
                  code: (chunks) => (
                    <code className="rounded-sm bg-background/70 px-1 py-px font-mono text-[0.8125rem] whitespace-nowrap">
                      {chunks}
                    </code>
                  ),
                })}
              </span>
            </p>
          ) : null}

          <Form {...form}>
            <form
              noValidate
              aria-labelledby={titleId}
              data-slot="sign-in-form"
              onSubmit={submit}
              className="mt-6 flex flex-col"
            >
              <div className="flex flex-col gap-4">
                <BorderlessCredentialFields
                  form={form}
                  autoFocus={autoFocus ? "email" : undefined}
                />
              </div>
              <BorderlessFormError
                slot="sign-in-error"
                message={error}
                hint={errorHint}
              />
              <PendingSubmitButton
                pending={pending}
                size="lg"
                className="mt-5 h-11 w-full font-display text-base font-semibold glow-primary"
              >
                {t("submit")}
              </PendingSubmitButton>
            </form>
          </Form>

          <p
            data-slot="sign-in-password-hint"
            className="mt-4 flex items-start gap-2 text-[0.8125rem] leading-5 text-foreground/70"
          >
            <KeyRound aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0">{t("passwordHint")}</span>
          </p>

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
