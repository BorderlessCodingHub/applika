import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { loadMessages } from "@/i18n/load-messages";
import { setTranslatorLocale } from "@/i18n/translator";
import { renderInPortuguese } from "@/test/portuguese";

import { BadgeGateView } from "./badge-gate";
import { confirmMembershipReason } from "./confirm-membership-form";
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
        confirm={null}
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

  it("gives the confirm reason in Portuguese", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));

    expect(confirmMembershipReason("expired", "borderless_psp")).toBe(
      "Seu acesso à Borderless expirou, então seu selo PSP está pausado.",
    );
    expect(confirmMembershipReason("needs_reconnect", null)).toBe(
      "A Borderless não aceitou a última verificação da sua associação feita pelo Applika.",
    );
  });
});
