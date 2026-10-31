import { useLocale } from "next-intl";

import { getTranslatorLocale } from "@/i18n/translator";

/**
 * The BCP 47 tag an `Intl` formatter (or `toLocale*String`) takes for an app
 * language: `pt-BR`, or the English tag the call site has always used (`en`,
 * `en-US`), so English output stays byte-identical.
 */
export function intlTag(locale: string, english = "en"): string {
  return locale === "pt-BR" ? "pt-BR" : english;
}

/**
 * The `Intl` tag for the active language, read at call time from the module
 * translator: for code outside React (a hook's toast, a copy helper). A
 * component rendering the result must subscribe (`useLocale`), or use
 * `useIntlLocale` instead.
 */
export function intlLocale(english = "en"): string {
  return intlTag(getTranslatorLocale(), english);
}

/** `intlLocale` for render: subscribes, so a switch re-renders the dates. */
export function useIntlLocale(english = "en"): string {
  return intlTag(useLocale(), english);
}
