import { readFileSync } from "node:fs";

import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  apiUrl,
  authCookieHeader,
  loginAs,
  type SeededRole,
} from "./support/auth";

/**
 * The language switcher and the two languages (ADR-0025, plan 0019) against
 * the real stack: the built API and web, Postgres, Redis. No mocked API.
 *
 * The ONLY spec that runs in a Portuguese browser: `test.use({ locale:
 * "pt-BR" })` below. Every other spec stays pinned to `en-US` by
 * `playwright.config.ts`.
 *
 * Serial, and it cleans up after itself: every test runs in its own browser
 * context (its cookies, `NEXT_LOCALE` included, go with it, and `afterEach`
 * clears them too), and the saved searches the error test makes for e2e-user
 * are deleted by name in `afterAll`, even after a failure.
 *
 * Locators: the switcher is a radiogroup named "Toggle language" ("Alternar
 * idioma" in Portuguese); its radios are named by their endonyms, "English"
 * and "Português" (visible text "EN" and "BR"). Inside the signed-in shell
 * the switcher is scoped to the header (`banner`).
 */

test.describe.configure({ mode: "serial" });
test.use({ locale: "pt-BR" });

type Messages = { [key: string]: string | Messages };

function readMessages(file: string): Messages {
  return JSON.parse(
    readFileSync(
      new URL(`../src/i18n/messages/${file}`, import.meta.url),
      "utf8",
    ),
  ) as Messages;
}

function flatten(messages: Messages, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const EN = flatten(readMessages("en.json"));
const PT = flatten(readMessages("pt-BR.json"));

/**
 * Words that may legitimately show in English on a Portuguese screen: brand
 * and product names and the switcher's endonyms and short labels.
 */
const SWEEP_ALLOWED = new Set([
  "Applika",
  "applika",
  "applika-cli",
  "Borderless",
  "GitHub",
  "LinkedIn",
  "Discord",
  "BASE",
  "PSP",
  "English",
  "Português",
  "EN",
  "BR",
]);

/**
 * The English words that must NOT appear on a Portuguese screen: every `en`
 * message whose `pt-BR` twin differs. Left out: messages with ICU arguments or
 * rich-text tags (they never render verbatim), a word that is also some
 * `pt-BR` value (it is Portuguese too, e.g. "Beta", "Webhooks"), and the
 * allowances above.
 */
const ENGLISH_ONLY = (() => {
  const portuguese = new Set(PT.values());
  const words = new Set<string>();
  for (const [key, en] of EN) {
    const value = en.replace(/\s+/g, " ").trim();
    if (!value || /[{<]/.test(value)) continue;
    if (PT.get(key) === en) continue;
    if (portuguese.has(en) || portuguese.has(value)) continue;
    if (SWEEP_ALLOWED.has(value)) continue;
    words.add(value);
  }
  return words;
})();

/**
 * The route list of `e2e/smoke.spec.ts` (`PAGES`), read from the file so the
 * sweep follows it: a route added there is swept here with no edit.
 */
const SMOKE_ROUTES: Array<{ path: string; visitor: SeededRole | "anon" }> =
  (() => {
    const source = readFileSync(
      new URL("./smoke.spec.ts", import.meta.url),
      "utf8",
    );
    const rows = [
      ...source.matchAll(/path: "([^"]+)",\s*visitors: \[([^\]]+)\]/g),
    ];
    return rows.map(([, path, visitors]) => ({
      path,
      visitor: visitors.match(/"([a-z]+)"/)![1] as SeededRole | "anon",
    }));
  })();

const SAVED_SEARCH_PREFIX = "lang-e2e";
const MAX_SAVED_SEARCHES = 10;

function html(page: Page) {
  return page.locator("html");
}

async function expectLanguage(page: Page, lang: "en" | "pt-BR") {
  await expect(html(page)).toHaveAttribute("lang", lang);
}

function switcher(scope: Page | ReturnType<Page["getByRole"]>, name: string) {
  return scope.getByRole("radiogroup", { name });
}

async function localeCookie(context: BrowserContext) {
  return (await context.cookies()).find(
    (cookie) => cookie.name === "NEXT_LOCALE",
  );
}

async function setLocaleCookie(context: BrowserContext, value: string) {
  await context.addCookies([
    {
      name: "NEXT_LOCALE",
      value,
      domain: "127.0.0.1",
      path: "/",
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/**
 * Every visible text on the page (and the visible elements' accessible-name
 * attributes) that equals an `en` message with a different `pt-BR` twin.
 * Skipped: `<script>`/`<style>`, hidden elements (`checkVisibility`), and
 * anything inside an element whose `lang` is not Portuguese (the switcher's
 * "English" radio says `lang="en"`). `sr-only` text counts: it is clipped,
 * not hidden.
 */
async function englishLeftovers(
  page: Page,
  apiData: ReadonlySet<string> = new Set(),
): Promise<string[]> {
  const found = await page.evaluate(() => {
    const texts: string[] = [];
    const norm = (value: string) => value.replace(/\s+/g, " ").trim();
    const foreign = (element: Element) => {
      const owner = element.closest("[lang]");
      return (
        owner !== null &&
        owner !== document.documentElement &&
        !(owner.getAttribute("lang") ?? "").startsWith("pt")
      );
    };
    const shown = (element: Element) =>
      element.checkVisibility({ visibilityProperty: true });

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, noscript, template")) {
        continue;
      }
      if (foreign(parent) || !shown(parent)) continue;
      const text = norm(node.textContent ?? "");
      if (text) texts.push(text);
    }
    for (const element of document.body.querySelectorAll(
      "[aria-label], [placeholder], [title], [alt]",
    )) {
      if (foreign(element) || !shown(element)) continue;
      for (const attribute of ["aria-label", "placeholder", "title", "alt"]) {
        const value = norm(element.getAttribute(attribute) ?? "");
        if (value) texts.push(value);
      }
    }
    return texts;
  });
  return [
    ...new Set(
      found.filter((text) => ENGLISH_ONLY.has(text) && !apiData.has(text)),
    ),
  ].sort();
}

/**
 * Every string the API sends as DATA (2xx JSON bodies) on this page: a job's
 * `location_text` "Europe" equals the `en` region heading, yet it is shown as
 * sent on purpose. Error bodies (4xx/5xx) are never collected: a raw `detail`
 * on screen is exactly what the sweep must catch.
 */
function collectApiData(page: Page): {
  strings: Set<string>;
  settled: () => Promise<unknown>;
} {
  const strings = new Set<string>();
  const pending: Promise<void>[] = [];
  const origin = new URL(apiUrl("")).origin;
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      const text = value.replace(/\s+/g, " ").trim();
      if (text) strings.add(text);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  page.on("response", (response) => {
    if (new URL(response.url()).origin !== origin) return;
    if (response.status() < 200 || response.status() >= 300) return;
    if (!(response.headers()["content-type"] ?? "").includes("json")) return;
    // `/supports` still carries the legacy `steps`/`feedbacks` lists for old
    // CLIs ("Offer", "Denied", "Skills"…); the web never shows them, and
    // collecting them would hide those labels from the sweep.
    const legacy = new URL(response.url()).pathname.endsWith("/supports");
    pending.push(
      response.json().then(
        (body: unknown) => {
          if (legacy && body && typeof body === "object") {
            const rest: Record<string, unknown> = { ...body };
            delete rest.steps;
            delete rest.feedbacks;
            walk(rest);
          } else walk(body);
        },
        () => undefined,
      ),
    );
  });
  return { strings, settled: () => Promise.all(pending) };
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, "sideways scroll in px").toBeLessThanOrEqual(0);
}

function apiHeaders(role: SeededRole) {
  return { Cookie: authCookieHeader(role), "Content-Type": "application/json" };
}

async function savedSearches(
  request: APIRequestContext,
): Promise<Array<{ id: string; name: string }>> {
  const response = await request.get(apiUrl("/job-searches"), {
    headers: apiHeaders("user"),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as Array<{ id: string; name: string }>;
}

async function createSavedSearch(request: APIRequestContext, name: string) {
  const response = await request.post(apiUrl("/job-searches"), {
    headers: apiHeaders("user"),
    data: { name, filters: {} },
  });
  expect(response.status(), await response.text()).toBe(201);
}

async function deleteOwnSavedSearches(request: APIRequestContext) {
  for (const search of await savedSearches(request)) {
    if (!search.name.startsWith(SAVED_SEARCH_PREFIX)) continue;
    const response = await request.delete(
      apiUrl(`/job-searches/${search.id}`),
      { headers: apiHeaders("user") },
    );
    expect(response.ok(), await response.text()).toBeTruthy();
  }
}

async function newContextPage(
  browser: Browser,
  locale: string,
  viewport?: { width: number; height: number },
) {
  const context = await browser.newContext({ locale, viewport });
  return { context, page: await context.newPage() };
}

test.afterEach(async ({ context }) => {
  await context.clearCookies();
});

test.afterAll(async ({ request }) => {
  await deleteOwnSavedSearches(request);
});

test("a Portuguese browser gets Portuguese, and the switcher sits on every public page", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expectLanguage(page, "pt-BR");
  await expect(
    page.getByRole("heading", {
      name: "Gerencie sua busca de emprego com clareza",
    }),
  ).toBeVisible();
  // Resolving the browser's language writes no cookie: only a pick does.
  expect(await localeCookie(context)).toBeUndefined();

  for (const path of ["/", "/cookie-policy", "/login", "/cli/code"]) {
    await page.goto(path);
    await expectLanguage(page, "pt-BR");
    const group = switcher(page, "Alternar idioma");
    await expect(group, path).toHaveCount(1);
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio", { name: "Português" })).toBeChecked();
    await expect(
      group.getByRole("radio", { name: "English" }),
    ).not.toBeChecked();
    await expect(group.getByRole("radio")).toHaveText(["EN", "BR"]);
  }

  await page.goto("/cookie-policy");
  await expect(
    page.getByRole("heading", { name: "Política de Cookies", level: 1 }),
  ).toBeVisible();
  const localeRow = page.getByRole("row").filter({ hasText: "NEXT_LOCALE" });
  await expect(localeRow).toContainText("Lembra o idioma que você escolheu");
  await expect(localeRow).toContainText("1 ano (legível pela página)");

  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: "Entre no Applika", level: 1 }),
  ).toBeVisible();
  await page.goto("/cli/code");
  await expect(
    page.getByRole("heading", { name: "Entre no applika-cli", level: 1 }),
  ).toBeVisible();
});

test("EN is remembered for a year, survives a reload and sign-in; BR in the header switches in place", async ({
  page,
  context,
}) => {
  await test.step("EN on the landing page writes NEXT_LOCALE=en", async () => {
    await page.goto("/");
    await expectLanguage(page, "pt-BR");
    await switcher(page, "Alternar idioma")
      .getByRole("radio", { name: "English" })
      .click();
    await expectLanguage(page, "en");
    await expect(
      page.getByRole("heading", {
        name: "Manage your job search with clarity",
      }),
    ).toBeVisible();

    const cookie = await localeCookie(context);
    expect(cookie?.value).toBe("en");
    expect(cookie?.path).toBe("/");
    expect(cookie?.sameSite).toBe("Lax");
    const yearFromNow = Date.now() / 1000 + 365 * 24 * 3600;
    expect(Math.abs((cookie?.expires ?? 0) - yearFromNow)).toBeLessThan(
      24 * 3600,
    );
  });

  await test.step("a reload stays English", async () => {
    await page.reload();
    await expect(
      page.getByRole("heading", {
        name: "Manage your job search with clarity",
      }),
    ).toBeVisible();
    await expectLanguage(page, "en");
    await expect(
      switcher(page, "Toggle language").getByRole("radio", {
        name: "English",
      }),
    ).toBeChecked();
  });

  await test.step("signed in, the dashboard is English", async () => {
    await loginAs(page, "user");
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
    await expectLanguage(page, "en");
  });

  await test.step("BR in the header: Portuguese, same page, typed value kept", async () => {
    await page.goto("/applications");
    await expect(
      page.getByRole("heading", { name: "Applications", level: 1 }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Search company or role" })
      .fill("half typ");

    const url = page.url();
    await page.evaluate(() => {
      (window as unknown as { __languageMarker: string }).__languageMarker =
        "still here";
    });
    let navigations = 0;
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations += 1;
    });

    await page
      .getByRole("banner")
      .getByRole("radio", { name: "Português" })
      .click();

    await expectLanguage(page, "pt-BR");
    await expect(
      page.getByRole("heading", { name: "Candidaturas", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Buscar empresa ou cargo" }),
    ).toHaveValue("half typ");
    await expect(
      page.getByRole("banner").getByRole("radiogroup", {
        name: "Alternar idioma",
      }),
    ).toBeVisible();
    expect(page.url()).toBe(url);
    expect(navigations).toBe(0);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __languageMarker?: string }).__languageMarker,
      ),
    ).toBe("still here");
    expect((await localeCookie(context))?.value).toBe("pt-BR");
  });
});

test("API errors show in Portuguese by their code, params included", async ({
  page,
  request,
}) => {
  await deleteOwnSavedSearches(request);
  const taken = `${SAVED_SEARCH_PREFIX} taken`;
  await createSavedSearch(request, taken);

  await loginAs(page, "user");
  await page.goto("/jobs");
  await expectLanguage(page, "pt-BR");
  await expect(
    page.getByRole("heading", { name: "Vagas", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Buscas salvas" }).click();
  await expect(
    page.getByRole("button", { name: taken, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Salvar a busca atual" }).click();
  const dialog = page.getByRole("dialog", { name: "Salvar a busca atual" });
  await dialog.getByRole("textbox", { name: "Nome" }).fill(taken);
  await dialog.getByRole("button", { name: "Salvar busca" }).click();

  // JOB-1004 (409, no params).
  await expect(dialog.getByRole("alert")).toHaveText(
    "Já existe uma busca salva com este nome",
  );

  // Another device fills the list to its cap while this dialog is open, so
  // the next save reaches the API: JOB-1003 (409) with `params.max`.
  const existing = (await savedSearches(request)).length;
  for (let n = existing; n < MAX_SAVED_SEARCHES; n += 1) {
    await createSavedSearch(request, `${SAVED_SEARCH_PREFIX} ${n}`);
  }
  await dialog
    .getByRole("textbox", { name: "Nome" })
    .fill(`${SAVED_SEARCH_PREFIX} one more`);
  await dialog.getByRole("button", { name: "Salvar busca" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    `Limite de buscas salvas atingido (máximo de ${MAX_SAVED_SEARCHES})`,
  );

  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog).toBeHidden();
  await deleteOwnSavedSearches(request);
});

test("an admin page is Portuguese", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/admin");
  await expectLanguage(page, "pt-BR");
  await expect(
    page.getByRole("heading", { name: "Console de administração", level: 1 }),
  ).toBeVisible();
  await page.goto("/admin/features");
  await expect(
    page.getByRole("heading", { name: "Recursos", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Nome" }).first(),
  ).toBeVisible();
});

test.describe("pt-BR sweep: no English word left on any page", () => {
  test("the sweep reads smoke.spec.ts's whole route list", () => {
    expect(SMOKE_ROUTES).toHaveLength(23);
    expect(ENGLISH_ONLY.size).toBeGreaterThan(1000);
  });

  for (const route of SMOKE_ROUTES) {
    test(`${route.path} as ${route.visitor}`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      if (route.visitor !== "anon") await loginAs(page, route.visitor);
      const apiData = collectApiData(page);

      await page.goto(route.path);
      await expectLanguage(page, "pt-BR");
      await expect(page.locator("h1, h2").first()).toBeVisible();
      await page.waitForLoadState("networkidle");

      // Polled: the first paint is English (the static HTML), and data-driven
      // parts render after their request. API data is shown as sent (it is
      // English in both languages), so its strings are not leftovers.
      await expect
        .poll(
          async () => {
            await apiData.settled();
            return englishLeftovers(page, apiData.strings);
          },
          {
            message: `English words on ${route.path}`,
            timeout: 10_000,
          },
        )
        .toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
});

test("a garbage NEXT_LOCALE cookie is ignored: the browser's language decides", async ({
  browser,
  page,
  context,
}) => {
  await setLocaleCookie(context, "klingon");
  await page.goto("/");
  await expectLanguage(page, "pt-BR");
  await expect(
    page.getByRole("heading", {
      name: "Gerencie sua busca de emprego com clareza",
    }),
  ).toBeVisible();
  expect((await localeCookie(context))?.value).toBe("klingon");

  const english = await newContextPage(browser, "en-US");
  try {
    await setLocaleCookie(english.context, "klingon");
    await english.page.goto("/login");
    await expect(
      english.page.getByRole("heading", {
        name: "Sign in to applika",
        level: 1,
      }),
    ).toBeVisible();
    await english.page.waitForLoadState("networkidle");
    await expectLanguage(english.page, "en");
    await expect(
      switcher(english.page, "Toggle language").getByRole("radio", {
        name: "English",
      }),
    ).toBeChecked();
  } finally {
    await english.context.close();
  }
});

test.describe("320px: no sideways scroll", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  for (const lang of ["pt-BR", "en"] as const) {
    test(`landing, login and a signed-in page in ${lang}`, async ({
      page,
      context,
    }) => {
      await setLocaleCookie(context, lang);

      for (const path of ["/", "/login"]) {
        await page.goto(path);
        await expectLanguage(page, lang);
        await expect(page.getByRole("radiogroup")).toBeVisible();
        await noSidewaysScroll(page);
      }

      await loginAs(page, "user");
      for (const path of ["/", "/dashboard", "/applications"]) {
        await page.goto(path);
        await expectLanguage(page, lang);
        await expect(page.locator("h1, h2").first()).toBeVisible();
        await expect(page.getByRole("radiogroup").first()).toBeVisible();
        await page.waitForLoadState("networkidle");
        await noSidewaysScroll(page);
      }
    });
  }
});
