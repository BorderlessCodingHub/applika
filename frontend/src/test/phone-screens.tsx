import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";
import { navItemsFor } from "@/components/layout/nav";
import { CycleProvider, useCycleContext } from "@/contexts/cycle-context";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import { setTranslatorLocale } from "@/i18n/translator";
import type { MyFeature } from "@/services/types/features";
import type { User } from "@/services/types/users";
import { mockPhoneViewport } from "@/test/phone";

/** The signed-in user of the phone screen tests. */
export const SAM: User = {
  id: "u1",
  username: "scarter",
  email: "sam@example.com",
  first_name: "Sam",
  last_name: "Carter",
  github_id: null,
  badges: [],
  borderless: null,
  github_restore: { available: false, prompt: false },
};

export const WITH_CVS: MyFeature[] = [{ key: "cvs", stage: "beta" }];

/** A button that views an archived cycle, as the Insights cycle sheet does. */
export function PickPastCycle({ id = "c2" }: { id?: string }) {
  const { setSelectedCycleId } = useCycleContext();
  return (
    <button type="button" onClick={() => setSelectedCycleId(id)}>
      pick past cycle
    </button>
  );
}

/** The cycle the app views, said in a test hook. */
export function ViewedCycle() {
  const { selectedCycleId } = useCycleContext();
  return (
    <output data-testid="viewed-cycle">{selectedCycleId ?? "current"}</output>
  );
}

export interface PhoneScreenOptions {
  user?: User;
  features?: MyFeature[];
  locale?: "en" | "pt-BR";
  /** Rendered beside the page inside the shell (cycle pickers, probes). */
  extra?: ReactNode;
  client?: QueryClient;
}

/**
 * Renders `page` at `path` in the phone shell (the viewport below md), with
 * the query client (`features` and the user seeded), the cycle context and
 * the messages in the VIEWER's time zone, as `LocaleProvider` sets them once
 * the app runs (the setup's provider is UTC). For Portuguese the module
 * translator follows too.
 */
export async function renderPhoneScreen(
  path: string,
  page: ReactNode,
  {
    user = SAM,
    features = [],
    locale = "en",
    extra = null,
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
  }: PhoneScreenOptions = {},
) {
  mockPhoneViewport();
  if (locale === "pt-BR") {
    const { loadMessages } = await import("@/i18n/load-messages");
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
  }
  client.setQueryData(USER_QUERY_KEY, user);
  client.setQueryData(["user", "features"], features);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const result = render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : ptBR}
      timeZone={timeZone}
    >
      <QueryClientProvider client={client}>
        <CycleProvider>
          <AppShell
            activePath={path}
            navItems={navItemsFor(false, features, { hasReportsBadge: false })}
            user={user}
            onLogout={vi.fn()}
          >
            {page}
            {extra}
          </AppShell>
        </CycleProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { ...result, client };
}

/**
 * Renders `page` alone (no shell), with the query client (`features` and the
 * user seeded) and the cycle context, on a phone-wide viewport: for the
 * tests that turn the screen past md (`viewport.setPhone(false)`) and check
 * that the page swaps to today's desktop body. Outside the shell a screen's
 * `PhoneTopBarEnd` items render in place.
 */
export function renderPhonePage(
  page: ReactNode,
  {
    user = SAM,
    features = [],
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    }),
  }: Pick<PhoneScreenOptions, "user" | "features" | "client"> = {},
) {
  const viewport = mockPhoneViewport();
  client.setQueryData(USER_QUERY_KEY, user);
  client.setQueryData(["user", "features"], features);
  const result = render(
    <QueryClientProvider client={client}>
      <CycleProvider>{page}</CycleProvider>
    </QueryClientProvider>,
  );
  return { ...result, client, viewport };
}
