import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentType, ReactElement, ReactNode } from "react";

import { loadMessages } from "@/i18n/load-messages";
import ptBR from "@/i18n/messages/pt-BR.json";
import { setTranslatorLocale } from "@/i18n/translator";

/**
 * Renders `ui` in Portuguese: a `pt-BR` provider (inside the setup's English
 * one, so it wins) and the module translator pointed at `pt-BR`, so words read
 * outside React (`stageLabel`, the `*_COPY` getters, the nav labels) follow
 * too. `src/test/setup.ts` puts the translator back to `en` after each test.
 * A test's own `wrapper` sits inside the Portuguese provider.
 */
export async function renderInPortuguese(
  ui: ReactElement,
  options: RenderOptions = {},
) {
  setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
  const Inner = options.wrapper as
    | ComponentType<{ children: ReactNode }>
    | undefined;
  function Portuguese({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale="pt-BR" messages={ptBR} timeZone="UTC">
        {Inner ? <Inner>{children}</Inner> : children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { ...options, wrapper: Portuguese });
}
