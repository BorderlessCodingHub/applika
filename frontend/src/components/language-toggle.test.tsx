import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { useTranslations } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LANGUAGE_OPTIONS,
  LANGUAGE_TOGGLE_FLAG_CLASS,
  LANGUAGE_TOGGLE_ITEM_CLASS,
  LANGUAGE_TOGGLE_PENDING_CLASS,
  LANGUAGE_TOGGLE_ROOT_CLASS,
  LANGUAGE_TOGGLE_VARIANTS,
  LanguageToggle,
  LanguageToggleView,
  type LanguageToggleVariant,
} from "@/components/language-toggle";
import type { Locale } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";
import { LocaleProvider } from "@/i18n/locale-provider";
import type { Messages } from "@/i18n/translator";
import { getApiError } from "@/lib/api-client";

vi.mock("@/i18n/load-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/i18n/load-messages")>();
  return { loadMessages: vi.fn(actual.loadMessages) };
});

// `getApiError` lives beside the axios singleton, which imports the services.
vi.mock("@/services/services", () => ({ services: { auth: {} } }));

/** The reference's exact strings (plan 0019 `## Contract`). */
const ROOT =
  "inline-flex items-center rounded-full border p-0.5 shadow-xs transition-opacity";
const ITEM =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-none transition-all duration-200 md:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed";
const FLAG = "h-3 w-4 shrink-0 rounded-[1px]";
const VARIANTS = {
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
} as const;

const cookieSetter = vi.spyOn(Document.prototype, "cookie", "set");

function clearLocaleCookie() {
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
}

function setLanguages(languages: string[]) {
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(languages);
}

function localeWrites() {
  return cookieSetter.mock.calls
    .map(([value]) => String(value))
    .filter(
      (value) =>
        value.startsWith("NEXT_LOCALE=") && !value.includes("Max-Age=0"),
    );
}

beforeEach(() => {
  clearLocaleCookie();
  cookieSetter.mockClear();
  setLanguages(["en-US", "en"]);
  document.documentElement.lang = "en";
});

afterEach(() => {
  clearLocaleCookie();
  vi.mocked(loadMessages).mockClear();
});

function renderView(
  props: Partial<{
    variant: LanguageToggleVariant;
    locale: Locale;
    isPending: boolean;
  }> = {},
) {
  const onLocaleChange = vi.fn();
  render(
    <LanguageToggleView
      variant={props.variant}
      locale={props.locale ?? "en"}
      isPending={props.isPending ?? false}
      onLocaleChange={onLocaleChange}
      label="Toggle language"
    />,
  );
  return { onLocaleChange };
}

describe("LanguageToggleView: the reference, ported whole", () => {
  it("is one radio group named Toggle language: EN English, then BR Português", () => {
    renderView();
    const group = screen.getByRole("radiogroup", { name: "Toggle language" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toHaveAccessibleName("English");
    expect(radios[0]).toHaveTextContent("EN");
    expect(radios[0]).toHaveAttribute("lang", "en");
    expect(radios[1]).toHaveAccessibleName("Português");
    expect(radios[1]).toHaveTextContent("BR");
    expect(radios[1]).toHaveAttribute("lang", "pt-BR");
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveAttribute("aria-checked", "false");
  });

  it("puts the US flag on EN and the Brazil flag on BR, hidden from assistive tech", () => {
    renderView();
    const [enItem, brItem] = screen.getAllByRole("radio");
    const enFlag = enItem.querySelector("svg");
    const brFlag = brItem.querySelector("svg");
    expect(enFlag).toHaveAttribute("aria-hidden", "true");
    expect(brFlag).toHaveAttribute("aria-hidden", "true");
    expect(enFlag).toHaveAttribute("viewBox", "0 0 640 480");
    expect(brFlag).toHaveAttribute("viewBox", "-1960 -1470 3920 2940");
    // The flag goes first, then the short label in a span.
    expect(enItem.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(enItem.lastElementChild?.tagName.toLowerCase()).toBe("span");
  });

  it("exports the options and the class constants verbatim", () => {
    expect(
      LANGUAGE_OPTIONS.map(({ value, shortLabel, endonym }) => [
        value,
        shortLabel,
        endonym,
      ]),
    ).toEqual([
      ["en", "EN", "English"],
      ["pt-BR", "BR", "Português"],
    ]);
    expect(LANGUAGE_TOGGLE_ROOT_CLASS).toBe(ROOT);
    expect(LANGUAGE_TOGGLE_ITEM_CLASS).toBe(ITEM);
    expect(LANGUAGE_TOGGLE_FLAG_CLASS).toBe(FLAG);
    expect(LANGUAGE_TOGGLE_PENDING_CLASS).toBe("opacity-70");
    expect(LANGUAGE_TOGGLE_VARIANTS).toEqual(VARIANTS);
  });

  it.each(["default", "landing"] as const)(
    "renders every class of the %s look",
    (variant) => {
      renderView({ variant: variant === "default" ? undefined : variant });
      const tokens = VARIANTS[variant];
      const group = screen.getByRole("radiogroup");
      expect(group).toHaveAttribute("class", `${ROOT} ${tokens.root}`);
      const [active, inactive] = screen.getAllByRole("radio");
      expect(active).toHaveAttribute(
        "class",
        `${ITEM} ${tokens.active} ${tokens.focus}`,
      );
      expect(inactive).toHaveAttribute(
        "class",
        `${ITEM} ${tokens.inactive} ${tokens.focus}`,
      );
      for (const svg of group.querySelectorAll("svg")) {
        expect(svg).toHaveAttribute("class", FLAG);
      }
    },
  );

  it("the active look follows the locale prop", () => {
    renderView({ locale: "pt-BR" });
    const [enItem, brItem] = screen.getAllByRole("radio");
    expect(brItem).toHaveAttribute("aria-checked", "true");
    expect(brItem.className).toContain(VARIANTS.default.active);
    expect(enItem.className).toContain(VARIANTS.default.inactive);
  });

  it.each(["default", "landing"] as const)(
    "is disabled and at 70%% opacity while a change is pending (%s)",
    (variant) => {
      renderView({ variant, isPending: true });
      expect(screen.getByRole("radiogroup")).toHaveAttribute(
        "class",
        `${ROOT} ${VARIANTS[variant].root} opacity-70`,
      );
      for (const radio of screen.getAllByRole("radio")) {
        expect(radio).toBeDisabled();
      }
    },
  );

  it("reports the picked option", async () => {
    const user = userEvent.setup();
    const { onLocaleChange } = renderView();
    await user.click(screen.getByRole("radio", { name: "Português" }));
    expect(onLocaleChange).toHaveBeenCalledWith("pt-BR");
  });
});

/** A screen with a translated word and a half-filled field. */
function Probe() {
  const t = useTranslations("common");
  return (
    <div>
      <p data-testid="word">{t("cancel")}</p>
      <label>
        Name
        <input />
      </label>
    </div>
  );
}

function renderApp() {
  return render(
    <LocaleProvider>
      <LanguageToggle />
      <Probe />
    </LocaleProvider>,
  );
}

const portuguese = () => screen.getByRole("radio", { name: "Português" });
const english = () => screen.getByRole("radio", { name: "English" });

describe("LanguageToggle in the LocaleProvider", () => {
  it("starts in English with no cookie written", async () => {
    renderApp();
    expect(
      screen.getByRole("radiogroup", { name: "Toggle language" }),
    ).toBeVisible();
    expect(english()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("word")).toHaveTextContent("Cancel");
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(localeWrites()).toEqual([]);
  });

  it("a pick swaps every text in place, keeps typed values, saves the cookie and sets html lang", async () => {
    const user = userEvent.setup();
    const href = window.location.href;
    renderApp();
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "Ada Lovelace");

    await user.click(portuguese());

    await waitFor(() =>
      expect(screen.getByTestId("word")).toHaveTextContent("Cancelar"),
    );
    expect(
      screen.getByRole("radiogroup", { name: "Alternar idioma" }),
    ).toBeVisible();
    expect(portuguese()).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.lang).toBe("pt-BR");
    // The same field, still holding what was typed: nothing remounted.
    expect(screen.getByRole("textbox", { name: "Name" })).toBe(input);
    expect(input).toHaveValue("Ada Lovelace");
    expect(window.location.href).toBe(href);
    expect(localeWrites()).toEqual([
      "NEXT_LOCALE=pt-BR; Path=/; Max-Age=31536000; SameSite=Lax",
    ]);
    expect(document.cookie).toContain("NEXT_LOCALE=pt-BR");

    await user.click(english());
    await waitFor(() =>
      expect(screen.getByTestId("word")).toHaveTextContent("Cancel"),
    );
    expect(document.documentElement.lang).toBe("en");
    expect(localeWrites()).toHaveLength(2);
    expect(localeWrites()[1]).toBe(
      "NEXT_LOCALE=en; Path=/; Max-Age=31536000; SameSite=Lax",
    );
  });

  it("is disabled at 70% opacity while the messages load, then settles", async () => {
    let release: (messages: Messages) => void = () => {};
    const actual = await vi.importActual<typeof import("@/i18n/load-messages")>(
      "@/i18n/load-messages",
    );
    const messages = await actual.loadMessages("pt-BR");
    vi.mocked(loadMessages).mockImplementationOnce(
      () => new Promise<Messages>((resolve) => (release = resolve)),
    );
    const user = userEvent.setup();
    renderApp();

    await user.click(portuguese());

    await waitFor(() => expect(portuguese()).toBeDisabled());
    expect(english()).toBeDisabled();
    expect(screen.getByRole("radiogroup").className).toContain("opacity-70");
    // The active pill moved at once (optimistic); the words wait.
    expect(portuguese()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("word")).toHaveTextContent("Cancel");

    release(messages);

    await waitFor(() => expect(portuguese()).not.toBeDisabled());
    expect(screen.getByRole("radiogroup").className).not.toContain(
      "opacity-70",
    );
    expect(screen.getByTestId("word")).toHaveTextContent("Cancelar");
  });

  it("a saved cookie wins over the browser on load, and nothing is rewritten", async () => {
    document.cookie = "NEXT_LOCALE=pt-BR; Path=/";
    cookieSetter.mockClear();
    setLanguages(["en-US"]);
    renderApp();

    await waitFor(() =>
      expect(screen.getByTestId("word")).toHaveTextContent("Cancelar"),
    );
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(portuguese()).toHaveAttribute("aria-checked", "true");
    expect(localeWrites()).toEqual([]);
  });

  it.each([["pt"], ["pt-PT"], ["pt-BR"]])(
    "no cookie and a browser set to %s: Portuguese (Brazil)",
    async (language) => {
      setLanguages([language]);
      renderApp();
      await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));
      expect(screen.getByTestId("word")).toHaveTextContent("Cancelar");
      expect(localeWrites()).toEqual([]);
    },
  );

  it("a cookie with another value is ignored: the browser decides", async () => {
    document.cookie = "NEXT_LOCALE=fr; Path=/";
    setLanguages(["pt-PT"]);
    const { unmount } = renderApp();
    await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));
    unmount();

    setLanguages(["de-DE"]);
    renderApp();
    await waitFor(() =>
      expect(english()).toHaveAttribute("aria-checked", "true"),
    );
    expect(document.documentElement.lang).toBe("en");
  });

  it("cookies blocked: the switch holds for this page view, the next load follows the browser", async () => {
    // The browser drops the one write the pick makes.
    cookieSetter.mockImplementationOnce(() => {});
    const user = userEvent.setup();
    const { unmount } = renderApp();

    await user.click(portuguese());
    await waitFor(() =>
      expect(screen.getByTestId("word")).toHaveTextContent("Cancelar"),
    );
    expect(localeWrites()).toHaveLength(1);
    expect(document.cookie).not.toContain("NEXT_LOCALE");
    unmount();

    // The next load: no cookie, an English browser.
    renderApp();
    await waitFor(() =>
      expect(english()).toHaveAttribute("aria-checked", "true"),
    );
    expect(screen.getByTestId("word")).toHaveTextContent("Cancel");
  });

  it("another tab's pick is followed on the next page load", async () => {
    // Tab A picks Portuguese ...
    const user = userEvent.setup();
    const { unmount } = renderApp();
    await user.click(portuguese());
    await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));
    unmount();
    // ... tab B's next load reads the same cookie.
    renderApp();
    await waitFor(() =>
      expect(screen.getByTestId("word")).toHaveTextContent("Cancelar"),
    );
  });

  it("a request in flight during a switch answers in the new language", async () => {
    let fail: (error: AxiosError) => void = () => {};
    const request = new Promise<never>((_, reject) => (fail = reject));
    const user = userEvent.setup();
    renderApp();

    const answer = request.catch((error: AxiosError) => getApiError(error));
    await user.click(portuguese());
    await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));

    fail(
      new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 409,
        statusText: "Conflict",
        headers: new AxiosHeaders(),
        config: {} as never,
        data: {
          detail: "A platform with this name already exists: LinkedIn",
          code: "CAT-1003",
          params: { name: "LinkedIn" },
        },
      }),
    );
    expect(await answer).toBe(
      "Já existe uma plataforma com este nome: LinkedIn",
    );
  });

  it("a failed language load never crashes the page: the pill and the words stay", async () => {
    vi.mocked(loadMessages).mockRejectedValueOnce(new Error("chunk gone"));
    const user = userEvent.setup();
    renderApp();
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "Ada");

    await user.click(portuguese());

    await waitFor(() =>
      expect(english()).toHaveAttribute("aria-checked", "true"),
    );
    await waitFor(() => expect(english()).not.toBeDisabled());
    expect(portuguese()).not.toBeDisabled();
    expect(screen.getByTestId("word")).toHaveTextContent("Cancel");
    expect(screen.getByRole("textbox", { name: "Name" })).toBe(input);
    expect(input).toHaveValue("Ada");
    expect(document.documentElement.lang).toBe("en");

    // The next try loads and applies.
    await user.click(portuguese());
    await waitFor(() =>
      expect(screen.getByTestId("word")).toHaveTextContent("Cancelar"),
    );
  });

  it.each([
    ["no variant", undefined],
    ["variant default", "default"],
  ] as const)(
    "%s: the wrapper renders the default look, never the landing one",
    (_, variant) => {
      render(
        <LocaleProvider>
          <LanguageToggle variant={variant} />
        </LocaleProvider>,
      );
      const group = screen.getByRole("radiogroup");
      expect(group).toHaveAttribute(
        "class",
        `${ROOT} ${VARIANTS.default.root}`,
      );
      expect(screen.getByRole("radio", { name: "English" })).toHaveAttribute(
        "class",
        `${ITEM} ${VARIANTS.default.active} ${VARIANTS.default.focus}`,
      );
      expect(screen.getByRole("radio", { name: "Português" })).toHaveAttribute(
        "class",
        `${ITEM} ${VARIANTS.default.inactive} ${VARIANTS.default.focus}`,
      );
    },
  );

  it("passes the landing look through", () => {
    render(
      <LocaleProvider>
        <LanguageToggle variant="landing" />
      </LocaleProvider>,
    );
    expect(screen.getByRole("radiogroup")).toHaveAttribute(
      "class",
      `${ROOT} ${VARIANTS.landing.root}`,
    );
  });
});
