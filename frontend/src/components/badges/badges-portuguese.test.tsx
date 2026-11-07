import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import { BadgeGateView } from "./badge-gate";
import { MembershipBadge } from "./membership-badge";

/** The membership words in Portuguese; "BASE" and "PSP" are brand names and stay. */

describe("badges in Portuguese", () => {
  it("names the chip in Portuguese and keeps the brand word", async () => {
    await renderInPortuguese(<MembershipBadge badge="borderless_base" />);

    expect(
      screen.getByRole("img", { name: "Membro Borderless BASE" }),
    ).toHaveTextContent("BASE");
  });

  it("explains the closed reports in Portuguese", async () => {
    await renderInPortuguese(
      <BadgeGateView
        state="none"
        onSignInAgain={vi.fn()}
        borderlessHref="https://borderless.example"
      >
        <p>reports</p>
      </BadgeGateView>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Os relatórios são para membros BASE e PSP da Borderless",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Visitar a Borderless" }),
    ).toHaveAccessibleDescription("Abre em uma nova aba.");
  });

  it("asks to sign in again in Portuguese, with the API's words (AC16)", async () => {
    await renderInPortuguese(
      <BadgeGateView state="needs_reconnect" onSignInAgain={vi.fn()}>
        <p>reports</p>
      </BadgeGateView>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Entre novamente para abrir seus relatórios",
      }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Seu acesso pela Borderless terminou. Entre novamente no site do Applika para usar os recursos de membro",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Entrar novamente" }),
    ).toBeVisible();
  });
});
