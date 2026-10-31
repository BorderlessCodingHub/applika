/**
 * The two languages the web speaks (ADR-0025). No locale in the URL: the
 * choice lives in the `NEXT_LOCALE` browser cookie, read in the client only
 * (the site is a static export, so nothing reads it on a server).
 */
export const LOCALES = ["en", "pt-BR"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

/** One year, in seconds. */
export const LOCALE_COOKIE_MAX_AGE = 31_536_000;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}
