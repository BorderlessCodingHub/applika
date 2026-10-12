import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  SavedSearchesMenu,
  type SavedSearchesMenuProps,
} from "./saved-searches-menu";
import type { JobSearch } from "@/services/types/job-searches";
import { DEFAULT_JOB_FILTERS } from "@/services/types/jobs";

/** T087 / AC12, AC13: the menu's own behaviour. The URL half is in jobs-page.test.tsx. */

function search(id: string, name: string, overrides = {}): JobSearch {
  return {
    id,
    name,
    filters: { ...DEFAULT_JOB_FILTERS, ...overrides },
    created_at: "2026-10-01T00:00:00Z",
    updated_at: null,
  };
}

const RUST = search("1", "Rust remote", {
  tags: ["rust"],
  sort: "fit",
  source: "himalayas",
});

function renderMenu(props: Partial<SavedSearchesMenuProps> = {}) {
  const handlers = {
    onApply: vi.fn(),
    onSave: vi.fn().mockResolvedValue(undefined),
    onRename: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
  };
  render(<SavedSearchesMenu searches={[RUST]} {...handlers} {...props} />);
  return handlers;
}

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "Saved searches" }));
}

describe("SavedSearchesMenu", () => {
  it("lists saved searches by name with a summary, and applies one", async () => {
    const handlers = renderMenu();
    await openMenu();

    const apply = screen.getByRole("button", { name: "Rust remote" });
    expect(apply).toHaveAccessibleDescription("Best fit · Himalayas · rust");
    expect(screen.getByText("1 of 10")).toBeInTheDocument();
    await userEvent.click(apply);
    expect(handlers.onApply).toHaveBeenCalledWith(RUST);
  });

  it("marks the search matching the current filters", async () => {
    renderMenu({ activeId: "1" });
    await openMenu();
    expect(screen.getByRole("button", { name: "Rust remote" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("saves the current search under a name", async () => {
    const handlers = renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole("button", { name: "Save current search" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Save current search",
    });
    await userEvent.type(within(dialog).getByLabelText("Name"), "  Go jobs ");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save search" }),
    );

    await waitFor(() =>
      expect(handlers.onSave).toHaveBeenCalledWith("Go jobs"),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("refuses a blank name", async () => {
    const handlers = renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole("button", { name: "Save current search" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save search" }),
    );
    expect(
      await within(dialog).findByText("Give this search a name"),
    ).toBeInTheDocument();
    expect(handlers.onSave).not.toHaveBeenCalled();
  });

  it("shows a 409 detail inline and keeps the dialog open", async () => {
    const handlers = renderMenu();
    handlers.onSave.mockResolvedValue(
      "A saved search with this name already exists",
    );
    await openMenu();
    await userEvent.click(
      screen.getByRole("button", { name: "Save current search" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rust remote");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save search" }),
    );

    expect(
      await within(dialog).findByText(
        "A saved search with this name already exists",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renames a saved search", async () => {
    const handlers = renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole("button", { name: "Rename Rust remote" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Rename saved search",
    });
    const input = within(dialog).getByLabelText("Name");
    expect(input).toHaveValue("Rust remote");
    await userEvent.clear(input);
    await userEvent.type(input, "Rust, best fit");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Rename" }),
    );

    await waitFor(() =>
      expect(handlers.onRename).toHaveBeenCalledWith(RUST, "Rust, best fit"),
    );
  });

  it("deletes only after the confirmation", async () => {
    const handlers = renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole("button", { name: "Delete Rust remote" }),
    );
    const confirm = await screen.findByRole("alertdialog", {
      name: "Delete this saved search?",
    });
    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(confirm).toHaveTextContent(
      '"Rust remote" leaves your saved searches. Jobs and applications are not affected.',
    );
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Delete search" }),
    );
    await waitFor(() => expect(handlers.onDelete).toHaveBeenCalledWith(RUST));
  });

  it("disables saving at 10 and says why", async () => {
    renderMenu({
      searches: Array.from({ length: 10 }, (_, i) => search(`${i}`, `S${i}`)),
    });
    await openMenu();
    const save = screen.getByRole("button", { name: "Save current search" });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription(
      "You can keep up to 10 saved searches",
    );
  });

  it("shows the empty state", async () => {
    renderMenu({ searches: [] });
    await openMenu();
    expect(screen.getByText("No saved searches yet")).toBeInTheDocument();
  });

  it("offers no notification control of any kind (AC13)", async () => {
    renderMenu();
    await openMenu();
    expect(screen.queryByText(/notif|alert me|email|discord/i)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Save current search" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByText(/notif|alert me|email|discord/i),
    ).toBeNull();
    expect(within(dialog).queryByRole("switch")).toBeNull();
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
  });
});
