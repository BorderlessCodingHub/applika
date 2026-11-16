import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import { MCP_BANNER_STORAGE_KEY, McpPromoBanner } from "./mcp-promo-banner";

/**
 * PRD 0023 AC7: the banner that pointed to applika-cli points to the MCP
 * page now: same places, dismissed the same way (once per browser), under
 * its own key so a dismissed CLI banner does not hide it.
 */

afterEach(() => {
  window.localStorage.clear();
});

const region = () =>
  screen.queryByRole("region", { name: "Applika MCP announcement" });

describe("McpPromoBanner", () => {
  it("announces the MCP server and links to /mcp inside the app", () => {
    render(<McpPromoBanner />);

    const banner = within(region()!);
    expect(
      banner.getByText("Use Applika from your AI assistant"),
    ).toBeInTheDocument();
    expect(
      banner.getByText(
        "The Applika MCP server lets Claude Code, Cursor, VS Code and other AI apps log applications, update the timeline and tailor CVs for you. Nothing to install.",
      ),
    ).toBeInTheDocument();
    const cta = banner.getByRole("link", { name: "See how it works" });
    expect(cta).toHaveAttribute("href", "/mcp");
    expect(cta).not.toHaveAttribute("target");
    expect(region()).toHaveAttribute("data-slot", "mcp-promo-banner");
    expect(region()).not.toHaveTextContent(/applika-cli|PyPI/);
  });

  it("Dismiss hides it for good on this browser, under its own key", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<McpPromoBanner />);

    await user.click(
      screen.getByRole("button", { name: "Dismiss announcement" }),
    );
    expect(region()).toBeNull();
    expect(MCP_BANNER_STORAGE_KEY).toBe("applika.mcp-banner-dismissed");
    expect(window.localStorage.getItem(MCP_BANNER_STORAGE_KEY)).toBe("1");

    unmount();
    render(<McpPromoBanner />);
    expect(region()).toBeNull();
  });

  it("a dismissed applika-cli banner does not hide it", () => {
    window.localStorage.setItem("applika.cli-banner-dismissed", "1");
    render(<McpPromoBanner />);

    expect(region()).not.toBeNull();
  });

  it("follows a dismissal from another tab", () => {
    render(<McpPromoBanner />);
    expect(region()).not.toBeNull();

    act(() => {
      window.localStorage.setItem(MCP_BANNER_STORAGE_KEY, "1");
      window.dispatchEvent(new StorageEvent("storage"));
    });
    expect(region()).toBeNull();
  });

  it("speaks Portuguese", async () => {
    await renderInPortuguese(<McpPromoBanner />);

    const banner = screen.getByRole("region", {
      name: "Aviso do Applika MCP",
    });
    expect(
      within(banner).getByRole("link", { name: "Veja como funciona" }),
    ).toHaveAttribute("href", "/mcp");
    expect(
      within(banner).getByRole("button", { name: "Dispensar aviso" }),
    ).toBeInTheDocument();
  });
});
