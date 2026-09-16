import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserMenu } from "./user-menu";
import type { User } from "@/services/types/users";

/**
 * Account menu (KODI-004 / R-017, R-018).
 *
 * Covers the two properties the shell depends on: a long username or email
 * never widens the 15rem rail or the 14rem menu (T045), and the menu still
 * offers profile, feedback and logout (criterion 4).
 */

const LONG_NAME = "bartholomew-fitzgerald-montgomery-the-third";
const LONG_EMAIL =
  "bartholomew.fitzgerald.montgomery@a-very-long-company.example";

const user: User = {
  id: "u1",
  username: LONG_NAME,
  email: LONG_EMAIL,
  github_id: "gh1",
};

function renderMenu(
  props: Partial<React.ComponentProps<typeof UserMenu>> = {},
) {
  return render(
    <UserMenu
      user={user}
      onLogout={vi.fn()}
      onFeedback={vi.fn()}
      variant="card"
      {...props}
    />,
  );
}

describe("UserMenu", () => {
  it("renders nothing while there is no user", () => {
    const { container } = renderMenu({ user: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("names the card trigger with the username it displays", () => {
    renderMenu();

    // WCAG 2.5.3: the visible label is the username, so the accessible name
    // has to contain it or voice control cannot address the control.
    expect(
      screen.getByRole("button", {
        name: `Open account menu for ${LONG_NAME}`,
      }),
    ).toBeInTheDocument();
  });

  it("names the compact trigger without a username, having none on screen", () => {
    renderMenu({ variant: "avatar" });

    expect(
      screen.getByRole("button", { name: "Open account menu" }),
    ).toBeInTheDocument();
  });

  it("clips a long username and email instead of widening the rail", () => {
    renderMenu();

    // jsdom has no layout, so the ellipsis itself cannot be observed; the
    // assertion is that the clipping mechanism is actually wired to the two
    // fields that carry user-controlled length, inside a shrinkable box.
    const username = screen.getByText(LONG_NAME);
    const email = screen.getByText(LONG_EMAIL);

    expect(username).toHaveClass("truncate");
    expect(email).toHaveClass("truncate");
    expect(username.parentElement).toHaveClass("min-w-0");
  });

  it("keeps the full username and email reachable once the menu is open", async () => {
    renderMenu();

    await userEvent.click(
      screen.getByRole("button", { name: /Open account menu/ }),
    );

    const menu = await screen.findByRole("menu");
    // Truncation is visual only: the untruncated values stay available as the
    // label's tooltips, so nothing the user needs is actually lost.
    expect(screen.getByTitle(LONG_NAME)).toHaveTextContent(LONG_NAME);
    expect(screen.getByTitle(LONG_EMAIL)).toHaveTextContent(LONG_EMAIL);

    expect(
      within(menu).getByRole("menuitem", { name: "Profile" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Feedback" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Logout" }),
    ).toBeInTheDocument();
  });

  it("raises feedback through the shell rather than owning a dialog", async () => {
    const onFeedback = vi.fn();
    const onNavigate = vi.fn();
    renderMenu({ onFeedback, onNavigate });

    await userEvent.click(
      screen.getByRole("button", { name: /Open account menu/ }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Feedback" }),
    );

    expect(onFeedback).toHaveBeenCalledTimes(1);
    // The mobile sheet closes on the same signal.
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("logs out through the callback the shell passed in", async () => {
    const onLogout = vi.fn();
    renderMenu({ onLogout });

    await userEvent.click(
      screen.getByRole("button", { name: /Open account menu/ }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Logout" }),
    );

    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
