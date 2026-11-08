import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PRIMARY_NAV } from "./nav";
import { Sidebar } from "./sidebar";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

function renderSidebar(onNavigate = vi.fn()) {
  render(
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
    </div>,
  );
  return onNavigate;
}

describe("Sidebar", () => {
  it("links to the public applika-cli page outside the primary nav", async () => {
    const onNavigate = renderSidebar();

    const link = screen.getByRole("link", { name: "Applika CLI" });
    expect(link).toHaveAttribute("href", "/cli");
    expect(
      screen.getByRole("navigation", { name: "Primary" }),
    ).not.toContainElement(link);

    await userEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
