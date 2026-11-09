"use client";

import { useEffect, useId, useRef, type ReactNode, type Ref } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  CircleAlert,
  LoaderCircle,
  SquareTerminal,
} from "lucide-react";

import { ApplikaIcon } from "@/components/app-logo";
import { LanguageToggle } from "@/components/language-toggle";
import { PhoneNewspaperC } from "@/components/phone/phone-icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { PHONE_QUERY } from "@/hooks/use-is-phone";
import { cn } from "@/lib/utils";

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
  /** On mount, focus the visible tree's error when there is one, else its button. */
  autoFocus?: boolean;
}

export const BORDERLESS_BADGE_SRC = "/borderless-logo.png";

/** Option C's app icon: the Applika mark with the Borderless badge on its corner. */
function AppIconWithBadge({ large = false }: { large?: boolean }) {
  const t = useTranslations("auth.signIn.optionC");
  const badge = large ? 54 : 46;
  return (
    <span className={large ? "ph-app-ic-lg" : "ph-app-ic"}>
      <ApplikaIcon size={large ? 74 : 64} role="img" aria-label={t("logo")} />
      <span
        data-slot="sign-in-badge"
        className={large ? "ph-c-badge-lg" : "ph-c-badge"}
      >
        <Image
          src={BORDERLESS_BADGE_SRC}
          alt={t("badge")}
          width={badge}
          height={badge}
          unoptimized
        />
      </span>
    </span>
  );
}

interface SignInStatesProps {
  errorKey: SignInErrorCode | "unknown" | null;
  cli: boolean;
  errorRef: Ref<HTMLDivElement>;
}

/** v2/SignIn's states under the lead: the refusal (the focus target), else the terminal hint. */
function SignInStates({ errorKey, cli, errorRef }: SignInStatesProps) {
  const t = useTranslations("auth.signIn");
  const tErrors = useTranslations("errors");
  const cliRetry: ReactNode = t.rich("cliRetry", {
    command: t("cliCommand"),
    code: (chunks) => <code className="ph-mono">{chunks}</code>,
  });

  return (
    <>
      <div
        role="alert"
        data-slot="sign-in-error"
        data-code={errorKey ?? undefined}
        className="self-stretch"
      >
        {errorKey ? (
          <div
            ref={errorRef}
            tabIndex={-1}
            className="ph-signin-alert text-start outline-none"
          >
            <CircleAlert
              size={18}
              aria-hidden="true"
              className="mt-px flex-none text-(color:--destructive-text)"
            />
            <div className="flex min-w-0 flex-col gap-1 text-[14px] leading-[1.45]">
              <p className="m-0 font-semibold break-words">
                {tErrors(errorKey)}
              </p>
              {cli ? (
                <p
                  data-slot="sign-in-cli-hint"
                  className="m-0 text-muted-foreground"
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
          className="ph-signin-hint self-stretch text-start"
        >
          <SquareTerminal
            size={18}
            aria-hidden="true"
            className="mt-px flex-none text-muted-foreground"
          />
          <span className="min-w-0">{cliRetry}</span>
        </p>
      ) : null}
    </>
  );
}

interface SignInCtaProps {
  ctaRef: Ref<HTMLButtonElement>;
  leadId: string;
  pending: boolean;
  onSignIn: () => void;
  className: string;
}

function SignInCta({
  ctaRef,
  leadId,
  pending,
  onSignIn,
  className,
}: SignInCtaProps) {
  const t = useTranslations("auth.signIn");
  return (
    <button
      ref={ctaRef}
      type="button"
      data-action="sign-in-borderless"
      aria-describedby={leadId}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={() => {
        if (!pending) onSignIn();
      }}
      className={cn(
        "ph-btn ph-pri text-[16px] aria-busy:cursor-progress aria-busy:opacity-75",
        className,
      )}
    >
      {pending ? (
        <LoaderCircle
          size={18}
          strokeWidth={2.25}
          aria-hidden="true"
          className="ph-spin"
        />
      ) : null}
      {pending ? t("pending") : t("optionC.continue")}
    </button>
  );
}

function AccountLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  const t = useTranslations("auth.signIn");
  const newTabId = useId();
  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-describedby={newTabId}
        data-slot="create-borderless-account"
        className={cn(
          "flex min-h-11 items-center justify-center text-[15px] font-semibold text-muted-foreground",
          className,
        )}
      >
        {t("optionC.noAccount")}
      </a>
      <span id={newTabId} className="sr-only">
        {t("opensInNewTab")}
      </span>
    </>
  );
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
  const tC = useTranslations("auth.signIn.optionC");
  const phoneLeadId = useId();
  const desktopLeadId = useId();
  const phoneErrorRef = useRef<HTMLDivElement>(null);
  const phoneCtaRef = useRef<HTMLButtonElement>(null);
  const desktopErrorRef = useRef<HTMLDivElement>(null);
  const desktopCtaRef = useRef<HTMLButtonElement>(null);
  const errorKey = signInErrorKey(errorCode);

  // Both trees are mounted: only the one the width shows takes focus.
  useEffect(() => {
    if (!autoFocus) return;
    const isPhone = window.matchMedia(PHONE_QUERY).matches;
    const target = errorKey
      ? isPhone
        ? phoneErrorRef
        : desktopErrorRef
      : isPhone
        ? phoneCtaRef
        : desktopCtaRef;
    target.current?.focus();
  }, [autoFocus, errorKey]);

  return (
    <div
      data-slot="sign-in"
      data-mode={cli ? "cli" : "web"}
      data-pending={pending || undefined}
      className="ph-app relative flex min-h-viewport flex-col overflow-hidden"
    >
      <div className="ph-c-glow md:hidden" aria-hidden="true" />

      {/* One language + theme pair: the phone top bar, else top 20 right 24 at md and up. */}
      <div
        data-slot="sign-in-bar"
        className="ph-top relative px-3 md:absolute md:top-5 md:right-6 md:z-10 md:h-auto md:p-0"
      >
        <Link
          href="/"
          aria-label={tC("backToHome")}
          className="ph-iconbtn bg-transparent shadow-none md:hidden"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </Link>
        <div className="ph-pair flex items-center gap-2">
          <LanguageToggle variant="default" />
          <ThemeToggle />
        </div>
      </div>

      {/* signin/C_Mobile, below md. */}
      <main
        data-slot="sign-in-phone"
        className="relative flex flex-1 flex-col md:hidden"
      >
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AppIconWithBadge />
          <p className="mt-9 mb-0 text-[13px] font-semibold tracking-[0.08em] text-primary uppercase">
            {tC("eyebrow")}
          </p>
          <h1 className="mt-2.5 mb-0 text-[32px] leading-[1.1] font-extrabold tracking-[-0.035em]">
            {tC("headline")}
          </h1>
          <p
            id={phoneLeadId}
            className="mt-3 mb-0 text-[16px] leading-[1.5] text-muted-foreground"
          >
            {tC("lead")}
          </p>
          <SignInStates
            errorKey={errorKey}
            cli={cli}
            errorRef={phoneErrorRef}
          />
        </div>
        <div className="ph-safe-bottom relative flex flex-col gap-1.5 px-6 pt-4">
          <SignInCta
            ctaRef={phoneCtaRef}
            leadId={phoneLeadId}
            pending={pending}
            onSignIn={onSignIn}
            className="h-14"
          />
          <AccountLink href={createAccountHref} />
        </div>
      </main>

      {/* signin/C_Desktop, md and up. */}
      <div
        data-slot="sign-in-desktop"
        className="hidden min-h-0 flex-1 md:flex"
      >
        <section className="ph-c-side" aria-label={tC("about")}>
          <div className="ph-c-side-glow" aria-hidden="true" />
          <AppIconWithBadge large />
          <p className="relative mt-12 mb-0 text-[14px] font-semibold tracking-[0.08em] text-primary uppercase">
            {tC("eyebrow")}
          </p>
          <h2 className="ph-c-headline">{tC("headline")}</h2>
          <div className="relative mt-9 flex flex-col gap-3.5">
            <p className="ph-feat m-0">
              <span aria-hidden="true">
                <Briefcase size={18} />
              </span>
              {tC("featApplications")}
            </p>
            <p className="ph-feat m-0">
              <span aria-hidden="true">
                <Calendar size={18} />
              </span>
              {tC("featInterviews")}
            </p>
            <p className="ph-feat m-0">
              <span aria-hidden="true">
                <PhoneNewspaperC size={18} />
              </span>
              {tC("featReports")}
            </p>
          </div>
        </section>

        <main className="ph-c-main">
          <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.03em]">
            {t("title")}
          </h1>
          <p
            id={desktopLeadId}
            className="mt-2.5 mb-0 text-[16px] leading-[1.5] text-muted-foreground"
          >
            {tC("lead")}
          </p>
          <SignInStates
            errorKey={errorKey}
            cli={cli}
            errorRef={desktopErrorRef}
          />
          <SignInCta
            ctaRef={desktopCtaRef}
            leadId={desktopLeadId}
            pending={pending}
            onSignIn={onSignIn}
            className="mt-8 h-[52px] rounded-[14px]"
          />
          <AccountLink href={createAccountHref} className="mt-2" />
        </main>
      </div>

      <span
        role="status"
        data-slot="sign-in-pending-status"
        className="sr-only"
      >
        {pending ? t("pending") : null}
      </span>
    </div>
  );
}
