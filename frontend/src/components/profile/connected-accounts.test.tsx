import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConnectedAccounts } from "./connected-accounts";

/**
 * KODI-027 (plan 0009, T140/T141/T142) — the "Connected accounts" card,
 * presentational only. `account` replaced the old `linked` boolean
 * (KODI-022) with `{ name, avatarUrl, needsReconnect } | null` so the card
 * can show "Connected as <name>" and a Reconnect state. Covers all three
 * states (unlinked, linked, needs_reconnect), the Connect/Reconnect/
 * Disconnect wiring, the AlertDialog confirmation, and pins the privacy
 * rule: never render a Discord id, and never an avatar `<img>` in jsdom
 * (Radix `AvatarImage` never mounts without a real image load, so only the
 * fallback renders — see the design note).
 */

function renderCard(
  overrides: Partial<React.ComponentProps<typeof ConnectedAccounts>> = {},
) {
  const onConnect = vi.fn();
  const onDisconnect = vi.fn();
  render(
    <ConnectedAccounts
      account={null}
      onConnect={onConnect}
      onDisconnect={onDisconnect}
      {...overrides}
    />,
  );
  return { onConnect, onDisconnect };
}

describe("ConnectedAccounts", () => {
  it("unlinked: shows Connect Discord and no Disconnect", () => {
    renderCard({ account: null });

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

  it("linked: shows Discord connected, Connected as <name> and Disconnect Discord, never Connect", () => {
    renderCard({
      account: { name: "Ada Lovelace", avatarUrl: null, needsReconnect: false },
    });

    expect(screen.getByText("Discord connected")).toBeInTheDocument();
    expect(screen.getByText("Connected as Ada Lovelace")).toBeInTheDocument();
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

  it("falls back to the username when global_name is empty", () => {
    renderCard({
      account: { name: "adalovelace", avatarUrl: null, needsReconnect: false },
    });

    expect(screen.getByText("Connected as adalovelace")).toBeInTheDocument();
  });

  it("linked with no avatarUrl renders the Discord icon fallback, never an <img>", () => {
    renderCard({
      account: { name: "Ada", avatarUrl: null, needsReconnect: false },
    });

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const fallback = document.querySelector('[data-slot="avatar-fallback"]');
    expect(fallback).toBeInTheDocument();
    expect(fallback?.querySelector("svg")).toBeInTheDocument();
  });

  it("never renders a Discord id anywhere", () => {
    const { container } = render(
      <ConnectedAccounts
        account={{
          name: "Ada Lovelace",
          avatarUrl: null,
          needsReconnect: false,
        }}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    expect(container.textContent).not.toMatch(/\d{15,25}/); // a snowflake id
  });

  it("needs_reconnect: shows Reconnect needed badge and Reconnect Discord, then Disconnect Discord", () => {
    renderCard({
      account: { name: "Ada Lovelace", avatarUrl: null, needsReconnect: true },
    });

    expect(screen.getByText("Reconnect needed")).toBeInTheDocument();
    expect(screen.getByText("Connected as Ada Lovelace")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reconnect Discord" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect Discord" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect Discord" }),
    ).not.toBeInTheDocument();

    const row = screen
      .getByText("Discord")
      .closest('li[data-provider="discord"]');
    expect(row).toHaveAttribute("data-state", "needs_reconnect");
  });

  it("Reconnect Discord calls the same onConnect handler used by Connect", () => {
    const { onConnect } = renderCard({
      account: { name: "Ada", avatarUrl: null, needsReconnect: true },
    });

    fireEvent.click(screen.getByRole("button", { name: "Reconnect Discord" }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("Connect calls onConnect (wired to startDiscordLink by the profile page)", () => {
    const { onConnect } = renderCard({ account: null });

    fireEvent.click(screen.getByRole("button", { name: "Connect Discord" }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it("disables Connect and shows a busy indicator while connecting", () => {
    renderCard({ account: null, isConnecting: true });

    const connect = screen.getByRole("button", { name: "Connect Discord" });
    expect(connect).toBeDisabled();
    expect(connect).toHaveAttribute("aria-busy", "true");
  });

  it("does not offer Connect while linked, and does not offer Disconnect while unlinked", () => {
    const { rerender } = render(
      <ConnectedAccounts
        account={{ name: "Ada", avatarUrl: null, needsReconnect: false }}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Connect Discord" }),
    ).not.toBeInTheDocument();

    rerender(
      <ConnectedAccounts
        account={null}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Disconnect Discord" }),
    ).not.toBeInTheDocument();
  });

  it("Cancel in the confirm dialog does not call onDisconnect", () => {
    const { onDisconnect } = renderCard({
      account: { name: "Ada", avatarUrl: null, needsReconnect: false },
    });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Discord" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDisconnect).not.toHaveBeenCalled();
  });

  it("confirming Disconnect calls onDisconnect exactly once", () => {
    const { onDisconnect } = renderCard({
      account: { name: "Ada", avatarUrl: null, needsReconnect: false },
    });

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Discord" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(onDisconnect).toHaveBeenCalledTimes(1);
  });

  it("moves focus to Connect Discord once a confirmed disconnect flips account to null", async () => {
    const { rerender } = render(
      <ConnectedAccounts
        account={{ name: "Ada", avatarUrl: null, needsReconnect: false }}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Disconnect Discord" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    // Simulate the mutation succeeding and the parent re-rendering unlinked.
    rerender(
      <ConnectedAccounts
        account={null}
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
    renderCard({
      account: { name: "Ada", avatarUrl: null, needsReconnect: false },
      isDisconnecting: true,
    });

    const disconnect = screen.getByRole("button", {
      name: "Disconnect Discord",
    });
    expect(disconnect).toBeDisabled();
    expect(disconnect).toHaveAttribute("aria-busy", "true");
  });
});
