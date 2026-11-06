import { createTranslator } from "next-intl";

import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import en from "@/i18n/messages/en.json";

/**
 * The active language for code that runs outside React: the error helpers
 * (`getApiError`, `getBlobApiError`, `rateLimitNotice`,
 * `borderlessErrorWords`) read it at the moment they are called, so a request
 * that answers after a switch shows its message in the new language.
 *
 * `LocaleProvider` is the only writer (`setTranslatorLocale`). Until it
 * resolves — and in every test that renders no provider — the store holds
 * `en`.
 */
export type Messages = typeof en;

/** ICU arguments, as `params` sends them. */
export type TranslationValues = Record<string, string | number>;

type Store = {
  locale: Locale;
  messages: Messages;
  translate: ReturnType<typeof createTranslator<Messages>>;
};

function build(locale: Locale, messages: Messages): Store {
  return {
    locale,
    messages,
    translate: createTranslator({
      locale,
      messages,
      // A missing ICU argument must not render a half sentence: throw, and
      // `translate` returns null so the caller falls back.
      onError: (error) => {
        throw error;
      },
    }),
  };
}

let store: Store = build(DEFAULT_LOCALE, en);

export function setTranslatorLocale(locale: Locale, messages: Messages): void {
  if (store.locale === locale && store.messages === messages) return;
  store = build(locale, messages);
}

export function getTranslatorLocale(): Locale {
  return store.locale;
}

function lookup(key: string): unknown {
  let node: unknown = store.messages;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** Whether `key` (dotted, e.g. `errors.AUTH-1004`) is a message in the active language. */
export function hasMessage(key: string): boolean {
  return typeof lookup(key) === "string";
}

/**
 * The message for `key` in the active language, with its ICU arguments, or
 * `null` when the key is missing or an argument it names is missing (the
 * caller then falls back, never shows a half sentence).
 */
export function translate(
  key: string,
  values?: TranslationValues,
): string | null {
  if (!hasMessage(key)) return null;
  try {
    // The key is dynamic (an API code); `hasMessage` proved it exists.
    return (
      store.translate as unknown as (k: string, v?: TranslationValues) => string
    )(key, values);
  } catch {
    return null;
  }
}

/**
 * `translate` for words the app owns (a key that is always in both message
 * files): the message in the active language, or the key itself if it is
 * ever missing — never `null`. For module-level vocabulary read outside React
 * (`stageLabel`, the option lists' `label` getters, hooks' toasts). A
 * component rendering its result must also subscribe (`useTranslations` or
 * `useLocale`) so a switch re-renders it.
 */
export function word(key: string, values?: TranslationValues): string {
  return translate(key, values) ?? key;
}

/**
 * A copy object whose fields are getters over `<namespace>.<field>`: each read
 * returns the words of the active language. For the exported `*_COPY`
 * constants that tests and non-React code import; components rendering them
 * read the same keys with `useTranslations(namespace)` (which subscribes).
 * Never spread the result: a spread reads the getters once and freezes them.
 */
export function liveCopy<const K extends string>(
  namespace: string,
  fields: readonly K[],
): Readonly<Record<K, string>> {
  const copy = {} as Record<K, string>;
  for (const field of fields) {
    Object.defineProperty(copy, field, {
      enumerable: true,
      get: () => word(`${namespace}.${field}`),
    });
  }
  return copy;
}
