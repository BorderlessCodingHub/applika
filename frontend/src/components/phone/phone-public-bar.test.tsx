import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";

import { PhonePublicBar } from "./phone-public-bar";

/** v2/CookiePolicy's top bar for the public pages below md: Home and the pair. */
describe("PhonePublicBar", () => {
  it("is a phone-only sticky banner: Home to /, then language and theme", () => {
    render(<PhonePublicBar className="extra" />, { wrapper: LocaleProvider });
    const bar = screen.getByRole("banner");

    expect(bar).toHaveAttribute("data-slot", "phone-public-bar");
    expect(bar).toHaveClass("ph-app", "ph-top", "sticky", "md:hidden", "extra");
    const home = within(bar).getByRole("link", { name: "Home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveClass("ph-back");

    const group = within(bar).getByRole("radiogroup", {
      name: "Toggle language",
    });
    const theme = within(bar).getByRole("button", { name: /toggle theme/i });
    expect(group.nextElementSibling).toBe(theme);
    // The pair's 44px boxes come from `.ph-pair` below md.
    expect(group.parentElement).toHaveClass("ph-pair");
    // Focus order: Home, then the pair.
    expect(
      home.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
