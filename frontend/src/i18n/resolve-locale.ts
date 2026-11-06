import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "@/i18n/config";

/**
 * The language a page view starts in. Pure, so it is tested without a
 * browser:
 * 1. a `NEXT_LOCALE` cookie of exactly `en` or `pt-BR` wins;
 * 2. any other cookie value is ignored;
 * 3. else any preferred browser language starting with `pt` (`pt`, `pt-PT`,
 *    `pt-BR`) gives `pt-BR`;
 * 4. else `en`.
 */
export function resolveLocale(
  cookieValue: string | null | undefined,
  languages: readonly string[] | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const portuguese = (languages ?? []).some((language) =>
    /^pt(?:-|$)/i.test(language.trim()),
  );
  return portuguese ? "pt-BR" : DEFAULT_LOCALE;
}

/** The raw `NEXT_LOCALE` value from a `document.cookie` string, or `null`. */
export function readLocaleCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== LOCALE_COOKIE) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

/** The `document.cookie` assignment that saves `locale` for a year on every path. */
export function localeCookieString(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
}
