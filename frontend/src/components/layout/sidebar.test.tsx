import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import { PRIMARY_NAV } from "./nav";
import { Sidebar } from "./sidebar";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

function sidebar(onNavigate = vi.fn()) {
  return (
    // jsdom cannot navigate; swallow the default so the click stays a click.
    <div onClick={(event) => event.preventDefault()}>
      <Sidebar
        items={PRIMARY_NAV}
        activePath="/dashboard"
        user={null}
        onLogout={vi.fn()}
        onFeedback={vi.fn()}
        onNavigate={onNavigate}
      />
    </div>
  );
}

function renderSidebar(onNavigate = vi.fn()) {
  render(sidebar(onNavigate));
  return onNavigate;
}

describe("Sidebar", () => {
  it("links to the public Applika MCP page outside the primary nav, with no beta gate", async () => {
    const onNavigate = renderSidebar();

    const link = screen.getByRole("link", { name: "Applika MCP" });
    expect(link).toHaveAttribute("href", "/mcp");
    expect(link).toHaveAttribute("data-slot", "sidebar-mcp");
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).not.toContainElement(link);
    // No nav item and no `feature`: every signed-in user sees it (ADR-0028).
    expect(PRIMARY_NAV.some((item) => item.href === "/mcp")).toBe(false);
    expect(screen.queryByRole("link", { name: /CLI/ })).toBeNull();

    await userEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("names the link in Portuguese too (a product name)", async () => {
    await renderInPortuguese(sidebar());

    expect(screen.getByRole("link", { name: "Applika MCP" })).toHaveAttribute(
      "href",
      "/mcp",
    );
  });
});
