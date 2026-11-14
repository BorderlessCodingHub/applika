import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { APP_CONFIG } from "@/config";
import { LocaleProvider } from "@/i18n/locale-provider";
import { renderInPortuguese } from "@/test/portuguese";

import { CliPage, INSTALL, SIGN_IN, SKILL, TRACK } from "./cli-page";

/**
 * `/cli` mounts both widths' trees and CSS shows one: v3/Cli below md
 * (`[data-slot="cli-phone"]`, whose header holds the theme + language pair
 * and the sign-in button) and today's page at md and up
 * (`[data-slot="cli-desktop"]`). jsdom applies no CSS, so every query is
 * scoped by the tree's `data-slot`. Without an auth provider the phone
 * header's button reads the context default (loading, so signed out): "Sign
 * in".
 */

// The phone tree's header holds the language switcher: it needs a `LocaleProvider`.
function renderPage() {
  return render(<CliPage />, { wrapper: LocaleProvider });
}

const tree = (slot: "cli-phone" | "cli-desktop") =>
  document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
const desktop = () => within(tree("cli-desktop"));
const phone = () => within(tree("cli-phone"));

const writeText = vi.fn();

afterEach(() => {
  writeText.mockReset();
});

describe("CliPage, desktop tree (md and up)", () => {
  it("shows the CLI, its install commands and links to PyPI", () => {
    renderPage();

    expect(
      desktop().getByRole("heading", { level: 1, name: "applika-cli" }),
    ).toBeVisible();
    expect(desktop().getByText("uv tool install applika-cli")).toBeVisible();
    expect(desktop().getByText("applika login --device")).toBeVisible();
    expect(desktop().getByText("applika skill --local")).toBeVisible();
    const pypi = desktop().getAllByRole("link", { name: /View on PyPI/ });
    expect(pypi).toHaveLength(2);
    for (const link of pypi) {
      expect(link).toHaveAttribute("href", APP_CONFIG.cli.url);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("keeps today's one <main> in a wrapper that adds no box at md and up", () => {
    renderPage();

    expect(tree("cli-desktop")).toHaveClass("hidden", "md:contents");
    const main = desktop().getByRole("main");
    expect(tree("cli-desktop").children).toHaveLength(1);
    expect(tree("cli-desktop").firstElementChild).toBe(main);
    expect(main).toHaveClass(
      "relative",
      "mx-auto",
      "max-w-5xl",
      "px-5",
      "py-14",
      "md:px-8",
      "md:py-20",
    );
    // No pair and no phone bar inside today's tree: the landing layout's
    // header holds them at md and up.
    expect(desktop().queryByRole("radiogroup")).toBeNull();
    expect(document.querySelector('[data-slot="phone-public-bar"]')).toBeNull();
  });
});

describe("CliPage, phone tree (below md, v3/Cli)", () => {
  it("comes first, phone-only, with the one theme + language pair and Sign in in its header", () => {
    renderPage();

    expect(tree("cli-phone")).toHaveClass("ph-app", "md:hidden");
    expect(
      tree("cli-phone").compareDocumentPosition(tree("cli-desktop")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getAllByRole("radiogroup", { name: "Toggle language" }),
    ).toHaveLength(1);
    const header = phone().getByRole("banner");
    const group = within(header).getByRole("radiogroup", {
      name: "Toggle language",
    });
    const theme = within(header).getByRole("button", { name: /toggle theme/i });
    expect(theme.nextElementSibling).toBe(group);
    const home = within(header).getByRole("link", { name: "Applika.dev home" });
    expect(home).toHaveAttribute("href", "/");
    const signIn = within(header).getByRole("link", { name: "Sign in" });
    expect(signIn).toHaveAttribute("href", "/login");
    expect(within(header).getAllByRole("link")).toEqual([home, signIn]);
    expect(phone().getAllByRole("link", { name: /sign in/i })).toEqual([
      signIn,
    ]);
  });

  it("shows the board's sections with today's commands", () => {
    renderPage();

    expect(
      phone().getByRole("heading", { level: 1, name: "applika-cli" }),
    ).toBeInTheDocument();
    const pres = tree("cli-phone").querySelectorAll(
      '[data-slot="cli-phone-commands"]',
    );
    expect([...pres].map((pre) => pre.textContent)).toEqual(
      [INSTALL, SIGN_IN, TRACK, SKILL].map((commands) =>
        commands.map((command) => `$ ${command}`).join("\n"),
      ),
    );
    expect(
      phone().getAllByRole("button", { name: "Copy command" }),
    ).toHaveLength(4);
    expect(phone().getByRole("contentinfo")).toHaveTextContent("Cookie policy");
  });

  it("copies the same text at both widths", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    writeText.mockResolvedValue(undefined);
    renderPage();

    const desktopCopies = desktop().getAllByRole("button", {
      name: "Copy command",
    });
    const phoneCopies = phone().getAllByRole("button", {
      name: "Copy command",
    });
    expect(desktopCopies).toHaveLength(4);
    expect(phoneCopies).toHaveLength(4);
    for (let block = 0; block < 4; block++) {
      writeText.mockClear();
      await user.click(desktopCopies[block]);
      await user.click(phoneCopies[block]);
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(writeText.mock.calls[1][0]).toBe(writeText.mock.calls[0][0]);
    }
    expect(writeText.mock.calls[0][0]).toBe(SKILL.join("\n"));
  });
});

describe("CliPage in Portuguese", () => {
  it("reads in Portuguese (Brazil) in both trees, commands unchanged", async () => {
    await renderInPortuguese(<CliPage />, { localeSwitch: true });

    for (const view of [desktop(), phone()]) {
      expect(
        view.getByRole("heading", { level: 2, name: "Instalação" }),
      ).toBeInTheDocument();
      expect(
        view.getByRole("heading", {
          level: 2,
          name: "Ensine seu assistente de IA",
        }),
      ).toBeInTheDocument();
    }
    expect(desktop().getByText("uv tool install applika-cli")).toBeVisible();
    expect(
      tree("cli-phone").querySelector('[data-slot="cli-phone-commands"]'),
    ).toHaveTextContent("$ uv tool install applika-cli");
    expect(
      phone().getByRole("link", { name: "Página inicial do Applika.dev" }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("radiogroup", { name: "Alternar idioma" }),
    ).toBeInTheDocument();
  });
});
