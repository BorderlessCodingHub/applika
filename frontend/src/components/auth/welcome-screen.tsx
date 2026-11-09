"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { LoaderCircle, RotateCcw, Shield } from "lucide-react";

import { GithubIcon } from "@/components/brand-icons";
import { PhoneGithub } from "@/components/phone/phone-icons";
import { PhoneOption, PhoneOptionGroup } from "@/components/phone/phone-option";
import { GITHUB_RESTORE_COPY } from "@/components/profile/github-restore-copy";
import { Button } from "@/components/ui/button";
import { useIsPhone } from "@/hooks/use-is-phone";
import { cn } from "@/lib/utils";

export type WelcomePending = "restore" | "start-fresh" | null;

export interface WelcomeScreenProps {
  /** Starts the top-level GitHub navigation. */
  onRestore: () => void;
  /** Dismisses the prompt, then leaves for the return-to path or the dashboard. */
  onStartFresh: () => void;
  /** The choice in flight; both buttons lock until the browser leaves. */
  pending?: WelcomePending;
  className?: string;
}

/** The one-time choice a new Borderless account sees at `/welcome`. */
export function WelcomeScreen(props: WelcomeScreenProps) {
  return useIsPhone() ? (
    <PhoneWelcomeScreen {...props} />
  ) : (
    <DesktopWelcomeScreen {...props} />
  );
}

function DesktopWelcomeScreen({
  onRestore,
  onStartFresh,
  pending = null,
  className,
}: WelcomeScreenProps) {
  const t = useTranslations("welcome");
  const titleId = useId();
  const restoreBodyId = useId();
  const freshBodyId = useId();
  const locked = pending !== null;

  const spinner = (
    <LoaderCircle
      aria-hidden
      data-icon="inline-start"
      className="motion-safe:animate-spin"
    />
  );

  return (
    <section
      aria-labelledby={titleId}
      data-slot="welcome"
      data-pending={pending ?? undefined}
      className={cn(
        "mx-auto flex w-full max-w-2xl animate-fade-in-up flex-col gap-6 motion-reduce:animate-none md:pt-6",
        className,
      )}
    >
      <div className="min-w-0">
        <h1
          id={titleId}
          className="font-display text-2xl font-bold tracking-tight-display text-balance text-foreground sm:text-3xl"
        >
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-pretty text-foreground/70">
          {t("lead")}
        </p>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-card">
        <div
          data-choice="restore"
          className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("restoreTitle")}
            </h2>
            <p
              id={restoreBodyId}
              className="text-sm text-pretty text-foreground/80"
            >
              {t("restoreBody")}
            </p>
            <p className="text-xs text-pretty text-foreground/70">
              {GITHUB_RESTORE_COPY.privacy}
            </p>
          </div>
          <Button
            type="button"
            data-action="restore"
            aria-describedby={restoreBodyId}
            aria-disabled={locked || undefined}
            aria-busy={pending === "restore" || undefined}
            onClick={() => {
              if (!locked) onRestore();
            }}
            className="h-auto min-h-9 w-full whitespace-normal aria-disabled:opacity-70 sm:h-9 sm:w-auto sm:shrink-0 sm:whitespace-nowrap"
          >
            {pending === "restore" ? (
              spinner
            ) : (
              <GithubIcon aria-hidden data-icon="inline-start" />
            )}
            {t("restore")}
          </Button>
        </div>

        <div
          data-choice="start-fresh"
          className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("freshTitle")}
            </h2>
            <p
              id={freshBodyId}
              className="text-sm text-pretty text-foreground/80"
            >
              {t("freshBody")}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            data-action="start-fresh"
            aria-describedby={freshBodyId}
            aria-disabled={locked || undefined}
            aria-busy={pending === "start-fresh" || undefined}
            onClick={() => {
              if (!locked) onStartFresh();
            }}
            className="h-auto min-h-9 w-full whitespace-normal aria-disabled:opacity-70 sm:h-9 sm:w-auto sm:shrink-0 sm:whitespace-nowrap"
          >
            {pending === "start-fresh" ? spinner : null}
            {t("startFresh")}
          </Button>
        </div>
      </div>
    </section>
  );
}

type WelcomeChoice = "restore" | "start-fresh";

/** v2/Welcome below md: pick an answer (restore first, as drawn), then one button for it. */
export function PhoneWelcomeScreen({
  onRestore,
  onStartFresh,
  pending = null,
  className,
}: WelcomeScreenProps) {
  const t = useTranslations("welcome");
  const tPhone = useTranslations("phone.welcome");
  const tRestore = useTranslations("profile.githubRestore");
  const titleId = useId();
  const [choice, setChoice] = useState<WelcomeChoice>("restore");
  const locked = pending !== null;
  const restore = choice === "restore";

  return (
    <section
      aria-labelledby={titleId}
      data-slot="welcome-phone"
      data-pending={pending ?? undefined}
      data-choice={choice}
      className={cn("ph-app flex min-h-viewport flex-col", className)}
    >
      <div className="flex flex-1 flex-col px-6 pt-18">
        <span className="flex size-14 items-center justify-center rounded-[18px] bg-primary-muted text-primary">
          <RotateCcw size={26} aria-hidden="true" />
        </span>
        <h1 id={titleId} className="ph-h1 mt-6">
          {t("title")}
        </h1>
        <p className="ph-lead text-[16px]">{t("lead")}</p>
        <PhoneOptionGroup
          label={tPhone("howToStart")}
          value={choice}
          onValueChange={(next) => setChoice(next as WelcomeChoice)}
          disabled={locked}
          className="mt-7 gap-3"
        >
          <PhoneOption
            value="restore"
            size="lg"
            title={t("restoreTitle")}
            hint={t("restoreBody")}
          />
          <PhoneOption
            value="start-fresh"
            size="lg"
            title={t("freshTitle")}
            hint={t("freshBody")}
          />
        </PhoneOptionGroup>
      </div>

      <div className="ph-safe-bottom flex flex-col gap-3 px-6 pt-4">
        {restore ? (
          <p data-slot="welcome-restore-hint" className="ph-hint flex gap-2">
            <Shield size={16} aria-hidden="true" className="mt-px flex-none" />
            {tRestore("privacy")}
          </p>
        ) : null}
        <button
          type="button"
          data-action={choice}
          aria-disabled={locked || undefined}
          aria-busy={pending === choice || undefined}
          onClick={() => {
            if (locked) return;
            if (restore) onRestore();
            else onStartFresh();
          }}
          className="ph-btn ph-pri h-14 aria-disabled:cursor-progress aria-disabled:opacity-75"
        >
          {pending === choice ? (
            <LoaderCircle
              size={18}
              strokeWidth={2.25}
              aria-hidden="true"
              className="ph-spin"
            />
          ) : restore ? (
            <PhoneGithub size={18} aria-hidden="true" />
          ) : null}
          {restore ? t("restore") : t("startFresh")}
        </button>
      </div>
    </section>
  );
}
