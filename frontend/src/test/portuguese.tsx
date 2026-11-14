import { render, waitFor, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentType, ReactElement, ReactNode } from "react";
import { onTestFinished } from "vitest";

import { LOCALE_COOKIE } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";
import { LocaleProvider } from "@/i18n/locale-provider";
import ptBR from "@/i18n/messages/pt-BR.json";
import { setTranslatorLocale } from "@/i18n/translator";

export type PortugueseRenderOptions = RenderOptions & {
  /**
   * Also mount a `LocaleProvider` (outside the Portuguese messages) for a
   * screen that holds the language switcher (`useLocaleSwitch`): the
   * `NEXT_LOCALE=pt-BR` cookie is set first, so the provider resolves
   * Portuguese and never puts the translator back to `en`; the render waits
   * until it has (`<html lang="pt-BR">`). The cookie is cleared after the test.
   */
  localeSwitch?: boolean;
};

/**
 * Renders `ui` in Portuguese: a `pt-BR` provider (inside the setup's English
 * one, so it wins) and the module translator pointed at `pt-BR`, so words read
 * outside React (`stageLabel`, the `*_COPY` getters, the nav labels) follow
 * too. `src/test/setup.ts` puts the translator back to `en` after each test.
 * A test's own `wrapper` sits inside the Portuguese provider.
 */
export async function renderInPortuguese(
  ui: ReactElement,
  { localeSwitch = false, ...options }: PortugueseRenderOptions = {},
) {
  setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
  const Inner = options.wrapper as
    | ComponentType<{ children: ReactNode }>
    | undefined;
  function Portuguese({ children }: { children: ReactNode }) {
    const tree = (
      <NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
        {Inner ? <Inner>{children}</Inner> : children}
      </NextIntlClientProvider>
    );
    return localeSwitch ? <LocaleProvider>{tree}</LocaleProvider> : tree;
  }
  if (localeSwitch) {
    document.cookie = `${LOCALE_COOKIE}=pt-BR; Path=/`;
    onTestFinished(() => {
      document.cookie = `${LOCALE_COOKIE}=; Path=/; Max-Age=0`;
      document.documentElement.lang = "en";
    });
  }
  const result = render(ui, { ...options, wrapper: Portuguese });
  if (localeSwitch) {
    await waitFor(() => {
      if (document.documentElement.lang !== "pt-BR") {
        throw new Error("LocaleProvider has not resolved pt-BR yet");
      }
    });
  }
  return result;
}
