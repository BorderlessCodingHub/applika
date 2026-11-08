import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import { APP_CONFIG } from "@/config";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";

import { CliPage } from "./cli-page";

describe("CliPage", () => {
  it("shows the CLI, its install commands and links to PyPI", () => {
    render(<CliPage />);

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

  it("reads in Portuguese (Brazil), commands unchanged", () => {
    render(
      <NextIntlClientProvider
        locale="pt-BR"
        messages={ptBR as unknown as typeof en}
        timeZone="UTC"
      >
        <CliPage />
      </NextIntlClientProvider>,
    );

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
  });
});
