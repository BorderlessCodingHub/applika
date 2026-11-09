import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APP_CONFIG } from "@/config";
import { LocaleProvider } from "@/i18n/locale-provider";
import { renderInPortuguese } from "@/test/portuguese";

import { CliPage } from "./cli-page";

// Below md the page sits under the phone public bar, which holds the
// language switcher: it needs a `LocaleProvider`.
function renderPage() {
  return render(<CliPage />, { wrapper: LocaleProvider });
}

function publicBar() {
  return document.querySelector<HTMLElement>('[data-slot="phone-public-bar"]')!;
}

describe("CliPage", () => {
  it("shows the CLI, its install commands and links to PyPI", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "applika-cli" }),
    ).toBeVisible();
    expect(screen.getByText("uv tool install applika-cli")).toBeVisible();
    expect(screen.getByText("applika login --device")).toBeVisible();
    expect(screen.getByText("applika skill --local")).toBeVisible();
    for (const link of screen.getAllByRole("link", { name: /View on PyPI/ })) {
      expect(link).toHaveAttribute("href", APP_CONFIG.cli.url);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("keeps today's content under the phone public bar: Home and the pair", () => {
    renderPage();

    const bar = publicBar();
    expect(bar).toHaveClass("md:hidden");
    expect(within(bar).getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      within(bar).getByRole("radiogroup", { name: "Toggle language" }),
    ).toBeInTheDocument();
    expect(
      within(bar).getByRole("button", { name: /toggle theme/i }),
    ).toBeInTheDocument();
    // The bar comes before today's one <main>, never inside it.
    const main = screen.getByRole("main");
    expect(main).not.toContainElement(bar);
    expect(
      bar.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("reads in Portuguese (Brazil), commands unchanged", async () => {
    await renderInPortuguese(<CliPage />, { localeSwitch: true });

    expect(
      screen.getByRole("heading", { level: 2, name: "Instalação" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Ensine seu assistente de IA",
      }),
    ).toBeVisible();
    expect(screen.getByText("uv tool install applika-cli")).toBeVisible();
    expect(
      within(publicBar()).getByRole("link", { name: "Início" }),
    ).toHaveAttribute("href", "/");
  });
});
