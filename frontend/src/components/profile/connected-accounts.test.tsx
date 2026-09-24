import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConnectedAccounts } from "./connected-accounts";

/**
 * KODI-022 (plan 0009, T052/T057/T063/T067) — the "Connected accounts" card,
 * presentational only. Covers both the unlinked and linked states, the
 * Connect/Disconnect wiring and the AlertDialog confirmation, and pins the
 * privacy rule: never render a Discord id, name or avatar.
 */

function renderCard(
  overrides: Partial<React.ComponentProps<typeof ConnectedAccounts>> = {},
) {
  const onConnect = vi.fn();
  const onDisconnect = vi.fn();
  render(
    <ConnectedAccounts
      linked={false}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      {...overrides}
    />,
  );
  return { onConnect, onDisconnect };
}

describe("ConnectedAccounts", () => {
  it("unlinked: shows Connect Discord and no Disconnect", () => {
    renderCard({ linked: false });

    expect(
      screen.getByRole("button", { name: "Connect Discord" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Disconnect Discord" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();

    const row = screen
      .getByText("Discord")
      .closest('li[data-provider="discord"]');
    expect(row).toHaveAttribute("data-state", "unlinked");
  });

  it("linked: shows Discord connected and Disconnect Discord, never Connect", () => {
    renderCard({ linked: true });

    expect(screen.getByText("Discord connected")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect Discord" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Discord" }),
    ).not.toBeInTheDocument();

    const row = screen
      .getByText("Discord")
      .closest('li[data-provider="discord"]');
    expect(row).toHaveAttribute("data-state", "linked");
  });

  it("never renders a Discord id, name or avatar", () => {
    const { container } = render(
      <ConnectedAccounts
        linked={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    expect(container.textContent).not.toMatch(/\d{15,25}/); // a snowflake id
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("Connect calls onConnect (wired to startDiscordLink by the profile page)", () => {
    const { onConnect } = renderCard({ linked: false });

    fireEvent.click(screen.getByRole("button", { name: "Connect Discord" }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("disables Connect and shows a busy indicator while connecting", () => {
    renderCard({ linked: false, isConnecting: true });

    const connect = screen.getByRole("button", { name: "Connect Discord" });
    expect(connect).toBeDisabled();
    expect(connect).toHaveAttribute("aria-busy", "true");
  });

  it("does not offer Connect while linked, and does not offer Disconnect while unlinked", () => {
    const { rerender } = render(
      <ConnectedAccounts
        linked={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Connect Discord" }),
    ).not.toBeInTheDocument();

    rerender(
      <ConnectedAccounts
        linked={false}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Disconnect Discord" }),
    ).not.toBeInTheDocument();
  });

  it("Cancel in the confirm dialog does not call onDisconnect", () => {
    const { onDisconnect } = renderCard({ linked: true });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Discord" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("confirming Disconnect calls onDisconnect exactly once", () => {
    const { onDisconnect } = renderCard({ linked: true });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Discord" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("moves focus to Connect Discord once a confirmed disconnect flips linked to false", async () => {
    const { rerender } = render(
      <ConnectedAccounts
        linked={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Discord" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    // Simulate the mutation succeeding and the parent re-rendering unlinked.
    rerender(
      <ConnectedAccounts
        linked={false}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Connect Discord" }),
      ).toHaveFocus(),
    );
  });

  it("disables Disconnect and shows a busy indicator while disconnecting", () => {
    renderCard({ linked: true, isDisconnecting: true });

    const disconnect = screen.getByRole("button", {
      name: "Disconnect Discord",
    });
    expect(disconnect).toBeDisabled();
    expect(disconnect).toHaveAttribute("aria-busy", "true");
  });
});
