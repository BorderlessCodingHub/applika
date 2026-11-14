"use client";

import { NextIntlClientProvider } from "next-intl";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";
import en from "@/i18n/messages/en.json";
import {
  localeCookieString,
  readLocaleCookie,
  resolveLocale,
} from "@/i18n/resolve-locale";
import { setTranslatorLocale, type Messages } from "@/i18n/translator";

export type LocaleSwitch = {
  /** The chosen language; moves at once on a pick (optimistic). */
  locale: Locale;
  /** Picks a language: saves the cookie and swaps every text in place. */
  setLocale: (next: Locale) => void;
  /** `en` <-> `pt-BR`. */
  toggleLocale: () => void;
  /** True while the picked language's messages load and apply. */
  isPending: boolean;
};

const LocaleSwitchContext = createContext<LocaleSwitch | null>(null);

const noSubscription = () => () => {};
const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
// The static export prerenders in UTC; the browser's zone takes over right
// after hydration, so the first client render matches the HTML.
const serverTimeZone = () => "UTC";

/** Saves the pick for a year on every path. Blocked cookies: the pick lasts this page view only. */
function writeLocaleCookie(locale: Locale) {
  try {
    document.cookie = localeCookieString(locale);
  } catch {
    // Cookies disabled: the state still holds the language until reload.
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/**
 * The web's language (ADR-0025). Every page renders English first (the static
 * HTML, so hydration always matches); right after mount the provider resolves
 * the language (`resolveLocale`: the `NEXT_LOCALE` cookie, else the browser's
 * languages) and swaps the messages in place. A pick swaps them the same way:
 * no navigation, the tree stays mounted, so typed values stay. It also points
 * the non-React translator (`i18n/translator.ts`) at the same language and
 * sets `<html lang>`.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<{ locale: Locale; messages: Messages }>({
    locale: DEFAULT_LOCALE,
    messages: en,
  });
  const [chosen, setChosen] = useState<Locale>(DEFAULT_LOCALE);
  const [isPending, startTransition] = useTransition();
  const latest = useRef<Locale>(DEFAULT_LOCALE);
  /** The language whose messages are on screen (or about to be). */
  const applied = useRef<Locale>(DEFAULT_LOCALE);
  const timeZone = useSyncExternalStore(
    noSubscription,
    browserTimeZone,
    serverTimeZone,
  );

  /** Loads `next` and applies it, unless a later pick or resolve won the race. */
  const apply = useCallback(async (next: Locale) => {
    let messages: Messages;
    try {
      messages = await loadMessages(next);
    } catch {
      // The chunk could not load (offline, or a redeploy removed it). Never
      // crash the page: stay in the language on screen, the pill moves back.
      // The cookie, if written, is kept: the next load fetches fresh chunks.
      if (latest.current === next) {
        latest.current = applied.current;
        setChosen(applied.current);
      }
      return;
    }
    if (latest.current !== next) return;
    applied.current = next;
    startTransition(() => {
      setChosen(next);
      setTranslatorLocale(next, messages);
      setActive({ locale: next, messages });
    });
  }, []);

  // Resolve after mount, never during render: the cookie and the browser's
  // languages exist only in the browser. Nothing is written here.
  useEffect(() => {
    const initial = resolveLocale(
      readLocaleCookie(document.cookie),
      browserLanguages(),
    );
    if (initial === DEFAULT_LOCALE) return;
    latest.current = initial;
    void apply(initial);
  }, [apply]);

  useEffect(() => {
    document.documentElement.lang = active.locale;
  }, [active.locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (!isLocale(next)) return;
      latest.current = next;
      // The active pill moves at once; the words follow when loaded.
      setChosen(next);
      writeLocaleCookie(next);
      startTransition(() => apply(next));
    },
    [apply],
  );

  const toggleLocale = useCallback(() => {
    setLocale(latest.current === "en" ? "pt-BR" : "en");
  }, [setLocale]);

  const value = useMemo<LocaleSwitch>(
    () => ({ locale: chosen, setLocale, toggleLocale, isPending }),
    [chosen, setLocale, toggleLocale, isPending],
  );

  return (
    <LocaleSwitchContext.Provider value={value}>
      <NextIntlClientProvider
        locale={active.locale}
        messages={active.messages}
        timeZone={timeZone}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleSwitchContext.Provider>
  );
}

/** The language switch: `{locale, setLocale, toggleLocale, isPending}`. Needs `LocaleProvider`. */
export function useLocaleSwitch(): LocaleSwitch {
  const context = useContext(LocaleSwitchContext);
  if (!context) {
    throw new Error("useLocaleSwitch must be used within <LocaleProvider>");
  }
  return context;
}
