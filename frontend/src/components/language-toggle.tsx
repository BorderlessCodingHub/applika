"use client";

import { useTranslations } from "next-intl";
import { RadioGroup } from "radix-ui";
import { useEffect, useRef } from "react";
import { FlagBr } from "@/components/icons/flag-br";
import { FlagUs } from "@/components/icons/flag-us";
import type { Locale } from "@/i18n/config";
import { useLocaleSwitch } from "@/i18n/locale-provider";
import { cn } from "@/lib/utils";

export const LANGUAGE_OPTIONS = [
  { value: "en", shortLabel: "EN", endonym: "English", Flag: FlagUs },
  { value: "pt-BR", shortLabel: "BR", endonym: "Português", Flag: FlagBr },
] as const satisfies readonly {
  value: Locale;
  shortLabel: string;
  endonym: string;
  Flag: typeof FlagUs;
}[];

export type LanguageToggleVariant = "default" | "landing";

export const LANGUAGE_TOGGLE_ROOT_CLASS =
  "inline-flex items-center rounded-full border p-0.5 shadow-xs transition-opacity";

export const LANGUAGE_TOGGLE_PENDING_CLASS = "opacity-70";

export const LANGUAGE_TOGGLE_ITEM_CLASS =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none transition-all duration-200 md:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed";

export const LANGUAGE_TOGGLE_FLAG_CLASS = "h-3 w-4 shrink-0 rounded-[1px]";

export const LANGUAGE_TOGGLE_VARIANTS = {
  default: {
    root: "bg-muted/40 border-border/60",
    active: "bg-background text-foreground shadow-sm",
    inactive: "text-muted-foreground hover:text-foreground",
    focus: "ring-primary/40 ring-offset-background",
  },
  landing: {
    root: "bg-white/10 border-white/20",
    active: "bg-white/15 text-white",
    inactive: "text-white/50 hover:text-white",
    focus: "ring-white/60 ring-offset-[#0a0a0f]",
  },
} as const satisfies Record<
  LanguageToggleVariant,
  { root: string; active: string; inactive: string; focus: string }
>;

export type LanguageToggleViewProps = {
  variant?: LanguageToggleVariant;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  isPending: boolean;
  label: string;
};

export function LanguageToggleView({
  variant = "default",
  locale,
  onLocaleChange,
  isPending,
  label,
}: LanguageToggleViewProps) {
  const tokens = LANGUAGE_TOGGLE_VARIANTS[variant];
  const rootRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  // Disabling the focused item drops focus to <body>; hand it back once the switch settles.
  useEffect(() => {
    if (isPending || !restoreFocus.current) return;
    restoreFocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    rootRef.current
      ?.querySelector<HTMLElement>('[role="radio"][data-state="checked"]')
      ?.focus({ preventScroll: true });
  }, [isPending]);

  function handleValueChange(value: string) {
    const option = LANGUAGE_OPTIONS.find(
      (candidate) => candidate.value === value,
    );
    if (!option) return;
    restoreFocus.current =
      rootRef.current?.contains(document.activeElement) ?? false;
    onLocaleChange(option.value);
  }

  return (
    <RadioGroup.Root
      ref={rootRef}
      orientation="horizontal"
      value={locale}
      onValueChange={handleValueChange}
      disabled={isPending}
      aria-label={label}
      className={cn(
        LANGUAGE_TOGGLE_ROOT_CLASS,
        tokens.root,
        isPending && LANGUAGE_TOGGLE_PENDING_CLASS,
      )}
    >
      {LANGUAGE_OPTIONS.map(({ value, shortLabel, endonym, Flag }) => (
        <RadioGroup.Item
          key={value}
          value={value}
          lang={value}
          aria-label={endonym}
          className={cn(
            LANGUAGE_TOGGLE_ITEM_CLASS,
            value === locale ? tokens.active : tokens.inactive,
            tokens.focus,
          )}
        >
          <Flag className={LANGUAGE_TOGGLE_FLAG_CLASS} />
          <span>{shortLabel}</span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

/**
 * The Borderless platform's language switcher, ported whole: a pill-shaped
 * radio group, EN (United States flag) then BR (Brazil flag), disabled while
 * a change is in progress. `variant="landing"` is the reference's look on the
 * dark landing hero. Mount it outside any `<form>`.
 */
export function LanguageToggle({
  variant = "default",
}: {
  variant?: LanguageToggleVariant;
}) {
  const { locale, setLocale, isPending } = useLocaleSwitch();
  const t = useTranslations("header");
  return (
    <LanguageToggleView
      variant={variant}
      locale={locale}
      onLocaleChange={setLocale}
      isPending={isPending}
      label={t("toggleLanguage")}
    />
  );
}
